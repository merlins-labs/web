import type { AccountId } from './accountId/accountId'
import { fromAccountId } from './accountId/accountId'
import type { AssetId } from './assetId/assetId'
import { toAssetId } from './assetId/assetId'
import type { ChainId, ChainNamespace, ChainReference } from './chainId/chainId'
import * as constants from './constants'

export const accountIdToChainId = (accountId: AccountId): ChainId =>
  fromAccountId(accountId).chainId

export const accountIdToSpecifier = (accountId: AccountId): string =>
  fromAccountId(accountId).account

export const isValidChainPartsPair = (
  chainNamespace: ChainNamespace,
  chainReference: ChainReference,
) => constants.VALID_CHAIN_IDS[chainNamespace]?.includes(chainReference) || false

export const generateAssetIdFromMerlinsDenom = (denom: string): AssetId => {
  if (denom.startsWith('u') && denom !== 'uosmo') {
    return toAssetId({
      assetNamespace: constants.ASSET_NAMESPACE.native,
      assetReference: denom,
      chainId: constants.merlinsChainId,
    })
  }

  if (denom.startsWith('ibc')) {
    return toAssetId({
      assetNamespace: constants.ASSET_NAMESPACE.ibc,
      assetReference: denom.split('/')[1],
      chainId: constants.merlinsChainId,
    })
  }

  if (denom.startsWith('gamm')) {
    return toAssetId({
      assetNamespace: constants.ASSET_NAMESPACE.ibc,
      assetReference: denom,
      chainId: constants.merlinsChainId,
    })
  }

  return toAssetId({
    assetNamespace: constants.ASSET_NAMESPACE.slip44,
    assetReference: constants.ASSET_REFERENCE.Merlins,
    chainId: constants.merlinsChainId,
  })
}

export const bitcoinAssetMap = { [constants.btcAssetId]: 'bitcoin' }
export const bitcoinCashAssetMap = { [constants.bchAssetId]: 'bitcoin-cash' }
export const dogecoinAssetMap = { [constants.dogeAssetId]: 'dogecoin' }
export const litecoinAssetMap = { [constants.ltcAssetId]: 'litecoin' }
export const cosmosAssetMap = { [constants.cosmosAssetId]: 'cosmos' }
export const osmosisAssetMap = { [constants.osmosisAssetId]: 'osmosis' }
export const merlinsAssetMap = { [constants.merlinsAssetId]: 'merlins' }
export const thorchainAssetMap = { [constants.thorchainAssetId]: 'thorchain' }

interface Flavoring<FlavorT> {
  _type?: FlavorT
}

export type Nominal<T, FlavorT> = T & Flavoring<FlavorT>
