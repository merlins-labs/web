import { cosmosChainId, fromAccountId, merlinsChainId } from '@shapeshiftoss/caip'
import type { cosmos, GetFeeDataInput } from '@shapeshiftoss/chain-adapters'
import { merlins } from '@shapeshiftoss/chain-adapters'
import type { CosmosSignTx } from '@shapeshiftoss/hdwallet-core'
import { TxStatus } from '@shapeshiftoss/unchained-client'
import type { Result } from '@sniptt/monads'
import { getConfig } from 'config'
import { v4 as uuid } from 'uuid'
import type {
  GetTradeQuoteInput,
  GetUnsignedTxArgs,
  SwapErrorRight,
  Swapper2Api,
  TradeQuote2,
} from 'lib/swapper/api'
import type { SymbolDenomMapping } from 'lib/swapper/swappers/MerlinsSwapper/utils/helpers'
import {
  buildPerformIbcTransferUnsignedTx,
  buildSwapExactAmountInTx,
  symbolDenomMapping,
} from 'lib/swapper/swappers/MerlinsSwapper/utils/helpers'
import { assertGetCosmosSdkChainAdapter } from 'lib/utils/cosmosSdk'
import { createDefaultStatusResponse } from 'lib/utils/evm'
import { serializeTxIndex } from 'state/slices/txHistorySlice/utils'

import { getTradeQuote } from './getTradeQuote/getMultiHopTradeQuote'
import { COSMOSHUB_TO_MERLINS_CHANNEL, MERLINS_TO_COSMOSHUB_CHANNEL } from './utils/constants'
import { pollForComplete, pollForCrossChainComplete } from './utils/poll'
import type { MerlinsSupportedChainId } from './utils/types'

const tradeQuoteMetadata: Map<string, TradeQuote2> = new Map()

export const merlinsApi: Swapper2Api = {
  getTradeQuote: async (
    input: GetTradeQuoteInput,
    { sellAssetUsdRate }: { sellAssetUsdRate: string },
  ): Promise<Result<TradeQuote2, SwapErrorRight>> => {
    const tradeQuoteResult = await getTradeQuote(input, { sellAssetUsdRate })

    return tradeQuoteResult.map(tradeQuote => {
      const { receiveAccountNumber, receiveAddress, affiliateBps } = input
      const id = uuid()
      const quote = { id, receiveAddress, receiveAccountNumber, affiliateBps, ...tradeQuote }
      tradeQuoteMetadata.set(id, quote)
      return quote
    })
  },

  getUnsignedTx: async ({
    from,
    tradeQuote,
    stepIndex,
  }: GetUnsignedTxArgs): Promise<CosmosSignTx> => {
    if (!from) throw new Error('from address is required')

    const {
      accountNumber,
      buyAsset: stepBuyAsset,
      sellAsset: stepSellAsset,
      sellAmountBeforeFeesCryptoBaseUnit: stepSellAmountBeforeFeesCryptoBaseUnit,
    } = tradeQuote.steps[stepIndex]
    const quoteSellAsset = tradeQuote.steps[0].sellAsset
    const { receiveAddress, receiveAccountNumber } = tradeQuote

    // What we call an "Merlins" swap is a stretch - it's really an IBC transfer and a swap-exact-amount-in
    // Thus, an "Merlins" swap step can be one of these two
    const isIbcTransferStep = stepBuyAsset.chainId !== stepSellAsset.chainId

    const stepSellAssetIsOnMerlinsNetwork = stepSellAsset.chainId === merlinsChainId

    const stepSellAssetDenom = symbolDenomMapping[stepSellAsset.symbol as keyof SymbolDenomMapping]
    const stepBuyAssetDenom = symbolDenomMapping[stepBuyAsset.symbol as keyof SymbolDenomMapping]
    const nativeAssetDenom = stepSellAssetIsOnMerlinsNetwork ? 'ufury' : 'uatom'

    const merlinsAdapter = assertGetCosmosSdkChainAdapter(merlinsChainId) as merlins.ChainAdapter
    const cosmosAdapter = assertGetCosmosSdkChainAdapter(cosmosChainId) as cosmos.ChainAdapter
    const stepSellAssetAdapter = assertGetCosmosSdkChainAdapter(stepSellAsset.chainId) as
      | cosmos.ChainAdapter
      | merlins.ChainAdapter

    const { REACT_APP_MERLINS_NODE_URL: osmoUrl, REACT_APP_COSMOS_NODE_URL: cosmosUrl } =
      getConfig()

    if (isIbcTransferStep) {
      /** If the sell asset is not on the Merlins network, we need to bridge the
       * asset to the Merlins network first in order to perform a swap on Merlins DEX.
       */

      const transfer = {
        sender: from,
        receiver: receiveAddress,
        amount: stepSellAmountBeforeFeesCryptoBaseUnit,
      }

      const responseAccount = await stepSellAssetAdapter.getAccount(from)
      const ibcAccountNumber = responseAccount.chainSpecific.accountNumber || '0'

      const sequence = responseAccount.chainSpecific.sequence || '0'

      const getFeeDataInput: Partial<GetFeeDataInput<MerlinsSupportedChainId>> = {}
      const sellAssetFeeData = await stepSellAssetAdapter.getFeeData(getFeeDataInput)

      const unsignedTx = await buildPerformIbcTransferUnsignedTx({
        input: transfer,
        adapter: stepSellAssetAdapter,
        // Used to get blockheight of the *destination* chain for the IBC transfer
        blockBaseUrl: stepSellAsset.chainId === cosmosChainId ? osmoUrl : cosmosUrl,
        // Transfer ATOM on Merlins if IBC transferring from Merlins to Cosmos, else IBC transfer ATOM to ATOM on Merlins
        denom:
          stepSellAsset.chainId === cosmosChainId ? nativeAssetDenom : symbolDenomMapping['ATOM'],
        sourceChannel: stepSellAssetIsOnMerlinsNetwork
          ? MERLINS_TO_COSMOSHUB_CHANNEL
          : COSMOSHUB_TO_MERLINS_CHANNEL,
        feeAmount: stepSellAssetIsOnMerlinsNetwork ? sellAssetFeeData.fast.txFee : merlins.MIN_FEE,
        accountNumber,
        ibcAccountNumber,
        sequence,
        gas: sellAssetFeeData.fast.chainSpecific.gasLimit,
        feeDenom: nativeAssetDenom,
      })

      return unsignedTx
    }

    /** At the current time, only FURY<->ATOM swaps are supported, so this is fine.
     * In the future, as more Merlins network assets are added, the buy asset should
     * be used as the fee asset automatically. See the whitelist of supported fee assets here:
     * https://github.com/merlins-labs/merlins/blob/04026675f75ca065fb89f965ab2d33c9840c965a/app/upgrades/v5/whitelist_feetokens.go
     */

    const getFeeDataInput: Partial<GetFeeDataInput<MerlinsSupportedChainId>> = {}
    const stepFeeData = await (stepSellAssetIsOnMerlinsNetwork
      ? merlinsAdapter.getFeeData(getFeeDataInput)
      : cosmosAdapter.getFeeData(getFeeDataInput))

    const quoteSellAssetIsOnMerlinsNetwork = quoteSellAsset.chainId === merlinsChainId
    const feeDenom = quoteSellAssetIsOnMerlinsNetwork
      ? symbolDenomMapping['FURY']
      : symbolDenomMapping['ATOM']

    const osmoAddress = quoteSellAssetIsOnMerlinsNetwork ? from : receiveAddress

    if (!quoteSellAssetIsOnMerlinsNetwork && receiveAccountNumber === undefined)
      throw new Error('receiveAccountNumber is required for ATOM -> FURY')

    const txToSign = await buildSwapExactAmountInTx({
      osmoAddress,
      accountNumber: quoteSellAssetIsOnMerlinsNetwork ? accountNumber : receiveAccountNumber!,
      adapter: merlinsAdapter,
      buyAssetDenom: stepBuyAssetDenom,
      sellAssetDenom: stepSellAssetDenom,
      sellAmount: stepSellAmountBeforeFeesCryptoBaseUnit,
      gas: stepFeeData.fast.chainSpecific.gasLimit,
      feeAmount: stepFeeData.fast.txFee,
      feeDenom,
    })

    return txToSign
  },

  checkTradeStatus: async ({
    txHash,
    quoteId,
    stepIndex,
    quoteSellAssetAccountId,
    quoteBuyAssetAccountId,
    getState,
  }): Promise<{ status: TxStatus; buyTxHash: string | undefined; message: string | undefined }> => {
    try {
      const quote = tradeQuoteMetadata.get(quoteId)
      const step = quote?.steps[stepIndex]
      if (!step) throw new Error('Step not found')
      const isAtomOsmoQuote =
        quote.steps[0].sellAsset.chainId === cosmosChainId &&
        quote.steps[1].buyAsset.chainId === merlinsChainId
      const isIbcTransferStep = step.buyAsset.chainId !== step.sellAsset.chainId
      if (!(quoteSellAssetAccountId && quoteBuyAssetAccountId))
        throw new Error('quote AccountIds required to check merlins trade status')
      if (isIbcTransferStep) {
        // IBC transfer is initiated from Merlins chain on FURY -> ATOM, and Cosmos on ATOM -> FURY
        const stepSellAssetAccountId = quoteSellAssetAccountId
        const initiatingChainTxid = serializeTxIndex(
          stepSellAssetAccountId,
          txHash,
          fromAccountId(stepSellAssetAccountId).account,
        )
        const pollResult = await pollForCrossChainComplete({
          initiatingChainTxid,
          initiatingChainAccountId: stepSellAssetAccountId,
          getState,
        })
        const status = pollResult === 'success' ? TxStatus.Confirmed : TxStatus.Failed

        return {
          status,
          buyTxHash: txHash,
          message: undefined,
        }
      } else {
        const stepSellAssetAccountId = isAtomOsmoQuote
          ? quoteBuyAssetAccountId
          : quoteSellAssetAccountId

        const txid = serializeTxIndex(
          stepSellAssetAccountId,
          txHash,
          fromAccountId(stepSellAssetAccountId).account,
        )

        const pollResult = await pollForComplete({
          txid,
          getState,
        })

        const status = pollResult === 'success' ? TxStatus.Confirmed : TxStatus.Failed

        return {
          status,
          buyTxHash: txHash,
          message: undefined,
        }
      }
    } catch (e) {
      console.error(e)
      return createDefaultStatusResponse(txHash)
    }
  },
}
