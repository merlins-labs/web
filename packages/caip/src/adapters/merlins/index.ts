import invert from 'lodash/invert'

import type { AssetId } from '../../assetId/assetId'
import { fromAssetId } from '../../assetId/assetId'
import * as adapters from './generated'
import { isNumeric, isMerlinsLpAsset } from './utils'

export const merlinsGetTokensUrl = 'https://api-merlins.imperator.co/tokens/v2/all'
export const merlinsGetLpTokensUrl =
  'https://api-merlins.imperator.co/pools/v2/all?low_liquidity=true'

const generatedAssetIdToMerlinsMap = Object.values(adapters).reduce((acc, cur) => ({
  ...acc,
  ...cur,
})) as Record<string, string>

const generatedMerlinsToAssetIdMap = invert(generatedAssetIdToMerlinsMap)

export const merlinsToAssetId = (id: string): string | undefined => generatedMerlinsToAssetIdMap[id]

export const assetIdToMerlins = (assetId: string): string | undefined =>
  generatedAssetIdToMerlinsMap[assetId]

export const merlinsLpAssetIdToPoolId = (lpAssetId: AssetId | string): string | undefined => {
  const { assetReference } = fromAssetId(lpAssetId)
  if (!isMerlinsLpAsset(assetReference)) return undefined

  const segments = assetReference.split('/')
  if (segments.length !== 3) return undefined

  const poolId: string = segments[2]
  if (!isNumeric(poolId)) return undefined

  return poolId
}
