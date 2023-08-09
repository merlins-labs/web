import { merlinsChainId } from '@shapeshiftoss/caip'
import type { cosmos, GetFeeDataInput } from '@shapeshiftoss/chain-adapters'
import { merlins } from '@shapeshiftoss/chain-adapters'
import type { Result } from '@sniptt/monads'
import { Err, Ok } from '@sniptt/monads'
import { getConfig } from 'config'
import type { Asset } from 'lib/asset-service'
import { bnOrZero } from 'lib/bignumber/bignumber'
import type {
  GetTradeQuoteInput,
  SwapErrorRight,
  TradeQuote,
  TradeQuoteStep,
} from 'lib/swapper/api'
import { makeSwapErrorRight, SwapErrorType } from 'lib/swapper/api'
import {
  getMinimumCryptoHuman,
  getRateInfo,
} from 'lib/swapper/swappers/MerlinsSwapper/utils/helpers'
import type { MerlinsSupportedChainId } from 'lib/swapper/swappers/MerlinsSwapper/utils/types'
import { assertGetCosmosSdkChainAdapter } from 'lib/utils/cosmosSdk'

import { DEFAULT_SOURCE } from '../utils/constants'

export const getTradeQuote = async (
  input: GetTradeQuoteInput,
  { sellAssetUsdRate }: { sellAssetUsdRate: string },
): Promise<Result<TradeQuote, SwapErrorRight>> => {
  const {
    // TODO(gomes): very very dangerous. We currently use account number both on the sending and receiving side and this will break cross-account.
    accountNumber,
    sellAsset,
    buyAsset,
    sellAmountBeforeFeesCryptoBaseUnit: sellAmountCryptoBaseUnit,
  } = input
  if (!sellAmountCryptoBaseUnit) {
    return Err(
      makeSwapErrorRight({
        message: 'sellAmount is required',
        code: SwapErrorType.RESPONSE_ERROR,
      }),
    )
  }

  const { REACT_APP_MERLINS_NODE_URL: osmoUrl } = getConfig()

  const maybeRateInfo = await getRateInfo(
    sellAsset.symbol,
    buyAsset.symbol,
    sellAmountCryptoBaseUnit,
    osmoUrl,
  )

  if (maybeRateInfo.isErr()) return Err(maybeRateInfo.unwrapErr())
  const { buyAssetTradeFeeCryptoBaseUnit, rate, buyAmountCryptoBaseUnit } = maybeRateInfo.unwrap()

  const minimumCryptoHuman = getMinimumCryptoHuman(sellAssetUsdRate)

  const buyAssetIsOnMerlinsNetwork = buyAsset.chainId === merlinsChainId
  const sellAssetIsOnMerlinsNetwork = sellAsset.chainId === merlinsChainId

  // Network fees

  const merlinsAdapter = assertGetCosmosSdkChainAdapter(merlinsChainId) as merlins.ChainAdapter
  // First hop network fees are always paid in the native asset of the sell chain
  // i.e ATOM for ATOM -> FURY IBC transfer, FURY for FURY -> ATOM swap-exact-amount-in
  const firstHopAdapter = assertGetCosmosSdkChainAdapter(sellAsset.chainId) as
    | cosmos.ChainAdapter
    | merlins.ChainAdapter
  const getFeeDataInput: Partial<GetFeeDataInput<MerlinsSupportedChainId>> = {}
  const firstHopFeeData = await firstHopAdapter.getFeeData(getFeeDataInput)
  const firstHopNetworkFee = firstHopFeeData.fast.txFee
  // Second hop *always* happens on Merlins, but the fee isn't necessarily paid in FURY
  // 1. for FURY -> ATOM, the IBC transfer fee is paid in FURY
  // 2. for ATOM -> FURY, the swap-exact-amount-in fee is paid in ATOM in FURY, *not* in FURY
  const secondHopAdapter = merlinsAdapter
  const merlinsFeeData = await secondHopAdapter.getFeeData(getFeeDataInput)
  // ATOM -> FURY swap-exact-amount-in doesn't fit our regular network fee model in that fees aren't paid in the chain's native asset
  // So we can't represent them as network fees, but rather need to represent them as protocol fees
  // Hence we zero out the network fees, which is semantically incorrect but the best we can do for now
  const secondHopNetworkFee = buyAssetIsOnMerlinsNetwork ? '0' : merlins.MIN_FEE

  // Protocol fees

  const merlinsToCosmosProtocolFees = [
    {
      [buyAsset.assetId]: {
        amountCryptoBaseUnit: buyAssetTradeFeeCryptoBaseUnit,
        requiresBalance: false,
        asset: buyAsset,
      },
    },
    {}, // No need to represent the second hop's network fee as a protocol fee since it's the hop chain's native asset
  ]

  const cosmosToMerlinsProtocolFees = [
    // Representing both as second hop fees, i.e both of these are effectively in the second hop:
    // - the ATOM being used for network fees when doing a swap-exact-amount-in
    // - the FURY being deducted as pool fees when doing the same swap-exact-amount-in
    {},
    {
      [buyAsset.assetId]: {
        amountCryptoBaseUnit: buyAssetTradeFeeCryptoBaseUnit,
        requiresBalance: false,
        asset: buyAsset,
      },
      [sellAsset.assetId]: {
        amountCryptoBaseUnit: merlinsFeeData.fast.txFee,
        requiresBalance: false, // network fee for second hop, represented as a protocol fee here
        asset: sellAsset,
      },
    },
  ]

  // Hardcoded to keep things simple, we may want to make an exchange request instead
  // https://shapeshift.readme.io/reference/assets-search
  const atomOnMerlinsAsset: Asset = {
    assetId:
      'cosmos:merlins-1/ibc:27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2',
    chainId: 'cosmos:merlins-1',
    symbol: 'ATOM',
    name: 'Cosmos Hub Atom on Merlins',
    precision: 6,
    color: '#272D45',
    icon: 'https://rawcdn.githack.com/cosmos/chain-registry/master/cosmoshub/images/atom.png',
    explorer: 'https://www.mintscan.io/merlins',
    explorerAddressLink: 'https://www.mintscan.io/merlins/account/',
    explorerTxLink: 'https://www.mintscan.io/merlins/txs/',
  }

  // First hop buy asset is always ATOM on Merlins i.e
  // - for ATOM -> FURY trades, we IBC transfer ATOM to ATOM on Merlins so we can then swap it for FURY
  // - for FURY -> ATOM trades, we swap FURY for ATOM on Merlins so we can then IBC transfer it
  const firstHopBuyAsset = atomOnMerlinsAsset
  // Regardless of whether or not we're on the ATOM -> FURY or FURY -> ATOM direction, the second swap is the one we actually get the buy asset
  const secondHopBuyAsset = buyAsset

  const firstStep: TradeQuoteStep<MerlinsSupportedChainId> = {
    allowanceContract: '',
    buyAsset: firstHopBuyAsset,
    feeData: {
      networkFeeCryptoBaseUnit: firstHopNetworkFee,
      protocolFees: sellAssetIsOnMerlinsNetwork
        ? merlinsToCosmosProtocolFees[0]
        : cosmosToMerlinsProtocolFees[0],
    },
    accountNumber,
    rate,
    sellAsset,
    sellAmountBeforeFeesCryptoBaseUnit: sellAmountCryptoBaseUnit,
    buyAmountBeforeFeesCryptoBaseUnit: sellAssetIsOnMerlinsNetwork
      ? buyAmountCryptoBaseUnit // FURY -> ATOM, the ATOM on FURY before fees is the same as the ATOM buy amount intent
      : sellAmountCryptoBaseUnit, // ATOM -> ATOM, the ATOM on FURY before fees is the same as the sold ATOM amount
    sources: DEFAULT_SOURCE,
  }

  const secondStep: TradeQuoteStep<MerlinsSupportedChainId> = {
    allowanceContract: '',
    buyAsset: secondHopBuyAsset,
    feeData: {
      networkFeeCryptoBaseUnit: secondHopNetworkFee,
      protocolFees: sellAssetIsOnMerlinsNetwork
        ? merlinsToCosmosProtocolFees[1]
        : cosmosToMerlinsProtocolFees[1],
    },
    accountNumber,
    rate,
    sellAsset: atomOnMerlinsAsset,
    sellAmountBeforeFeesCryptoBaseUnit: sellAssetIsOnMerlinsNetwork
      ? bnOrZero(firstStep.buyAmountBeforeFeesCryptoBaseUnit)
          .minus(firstHopFeeData.slow.txFee)
          .toString()
      : bnOrZero(firstStep.buyAmountBeforeFeesCryptoBaseUnit)
          .minus(firstHopFeeData.fast.txFee)
          .toString(),
    buyAmountBeforeFeesCryptoBaseUnit: bnOrZero(buyAmountCryptoBaseUnit).toString(),
    sources: DEFAULT_SOURCE,
  }

  return Ok({
    minimumCryptoHuman,
    steps: [firstStep, secondStep],
  })
}
