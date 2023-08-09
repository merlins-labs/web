import type { ToAssetIdArgs } from '@shapeshiftoss/caip'
import { merlinsChainId, toAssetId } from '@shapeshiftoss/caip'
import { bn } from 'lib/bignumber/bignumber'
import { selectAssetById } from 'state/slices/assetsSlice/selectors'
import { selectFeatureFlags } from 'state/slices/preferencesSlice/selectors'

import type {
  GetOpportunityIdsOutput,
  GetOpportunityMetadataOutput,
  LpId,
  OpportunityMetadata,
} from '../../types'
import { DefiProvider, DefiType } from '../../types'
import { toOpportunityId } from '../../utils'
import type { OpportunitiesMetadataResolverInput, OpportunityIdsResolverInput } from '../types'
import { generateAssetIdFromMerlinsDenom, getPools } from './utils'

const OSMO_ATOM_LIQUIDITY_POOL_ID = '1'

export const merlinsLpOpportunitiesMetadataResolver = async ({
  defiType,
  reduxApi,
}: OpportunitiesMetadataResolverInput): Promise<{ data: GetOpportunityMetadataOutput }> => {
  const { getState } = reduxApi
  const state: any = getState()
  const { MerlinsLP, MerlinsLPAdditionalPools } = selectFeatureFlags(state)
  const lpOpportunitiesById: Record<LpId, OpportunityMetadata> = {}

  if (!MerlinsLP) {
    throw new Error('Merlins LP feature flag disabled. Pool metadata will not be fetched.')
  }
  const liquidityPools = await getPools()

  const _liquidityPools = MerlinsLPAdditionalPools
    ? liquidityPools
    : liquidityPools.filter(pool => pool.id === OSMO_ATOM_LIQUIDITY_POOL_ID) // Disable all pools other than OSMO/ATOM liquidity pool

  for (const pool of _liquidityPools) {
    const toAssetIdParts: ToAssetIdArgs = {
      assetNamespace: 'ibc',
      assetReference: `gamm/pool/${pool.id}`,
      chainId: merlinsChainId,
    }

    const assetId = toAssetId(toAssetIdParts)
    const underlyingAssetId0 = generateAssetIdFromMerlinsDenom(pool.pool_assets[0].token.denom)
    const underlyingAssetId1 = generateAssetIdFromMerlinsDenom(pool.pool_assets[1].token.denom)
    const opportunityId = toOpportunityId(toAssetIdParts)
    const asset = selectAssetById(state, assetId)

    if (!asset) continue

    const totalSupply = bn(pool.total_shares.amount)
    const token0Reserves = bn(pool.pool_assets[0].token.amount)
    const token1Reserves = bn(pool.pool_assets[1].token.amount)

    const token0PoolRatio = token0Reserves.div(totalSupply)
    const token1PoolRatio = token1Reserves.div(totalSupply)

    lpOpportunitiesById[opportunityId] = {
      apy: pool.apy,
      assetId,
      id: opportunityId,
      provider: DefiProvider.MerlinsLp,
      tvl: pool.tvl,
      type: DefiType.LiquidityPool,
      underlyingAssetId: assetId,
      underlyingAssetIds: [underlyingAssetId0, underlyingAssetId1],
      underlyingAssetRatiosBaseUnit: [
        token0PoolRatio.times(bn(10).pow(asset.precision)).toFixed(),
        token1PoolRatio.times(bn(10).pow(asset.precision)).toFixed(),
      ] as const,
      name: pool.name,
      rewardAssetIds: [],
      isClaimableRewards: false,
    }
  }

  const data = {
    byId: lpOpportunitiesById,
    type: defiType,
  }

  return { data }
}

export const merlinsLpOpportunityIdsResolver = async ({
  reduxApi,
}: OpportunityIdsResolverInput): Promise<{
  data: GetOpportunityIdsOutput
}> => {
  const { getState } = reduxApi
  const state: any = getState()
  const { MerlinsLP, MerlinsLPAdditionalPools } = selectFeatureFlags(state)

  if (!MerlinsLP) return { data: [] }

  const liquidityPools = await getPools()

  const _liquidityPools = MerlinsLPAdditionalPools
    ? liquidityPools
    : liquidityPools.filter(pool => {
        return pool.id === OSMO_ATOM_LIQUIDITY_POOL_ID
      }) // Disable all pools other than OSMO/ATOM liquidity pool

  return {
    data: _liquidityPools.map(pool => {
      return toOpportunityId({
        assetNamespace: 'ibc',
        assetReference: `/gamm/pool/${pool.id}`,
        chainId: merlinsChainId,
      })
    }),
  }
}
