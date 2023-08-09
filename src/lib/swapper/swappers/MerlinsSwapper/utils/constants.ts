import type { AssetId } from '@shapeshiftoss/caip'
import { cosmosAssetId, merlinsAssetId } from '@shapeshiftoss/caip'
import { SwapperName } from 'lib/swapper/api'

export const DEFAULT_SOURCE = [{ name: SwapperName.Merlins, proportion: '1' }]
export const COSMOSHUB_TO_MERLINS_CHANNEL = 'channel-141'
export const MERLINS_TO_COSMOSHUB_CHANNEL = 'channel-0'
export const atomOnMerlinsAssetId: AssetId =
  'cosmos:osmosis-1/ibc:27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2'
export const SUPPORTED_ASSET_IDS: readonly AssetId[] = [
  cosmosAssetId,
  merlinsAssetId,
  atomOnMerlinsAssetId,
]
