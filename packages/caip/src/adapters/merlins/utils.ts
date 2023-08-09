import axios from 'axios'
import fs from 'fs'

import type { AssetNamespace, AssetReference } from '../../assetId/assetId'
import { toAssetId } from '../../assetId/assetId'
import { toChainId } from '../../chainId/chainId'
import { ASSET_REFERENCE, CHAIN_NAMESPACE, CHAIN_REFERENCE } from '../../constants'

export type MerlinsCoin = {
  price: number
  denom: string
  symbol: string
  liquidity: number
  liquidity_24h_change: number
  volume_24h: number
  volume_24h_change: number
  name: string
  price_24h_change: number
}

export type MerlinsPool = {
  symbol: string
  amount: number
  denom: string
  coingecko_id: string
  liquidity: number
  liquidity_24h_change: number
  volume_24h: number
  volume_24h_change: number
  volume_7d: number
  price: number
  fees: string
  main: boolean
}

export const writeFiles = async (data: Record<string, Record<string, string>>) => {
  const path = './src/adapters/merlins/generated/'
  const file = '/adapter.json'
  const writeFile = async ([k, v]: [string, unknown]) =>
    await fs.promises.writeFile(`${path}${k}${file}`.replace(':', '_'), JSON.stringify(v))
  await Promise.all(Object.entries(data).map(writeFile))
  console.info('Generated Merlins AssetId adapter data.')
}

export const fetchData = async ({
  tokensUrl,
  lpTokensUrl,
}: {
  tokensUrl: string
  lpTokensUrl: string
}): Promise<MerlinsCoin[]> => {
  const tokens = (await axios.get<MerlinsCoin[]>(tokensUrl)).data
  const lpTokenData = (await axios.get<{ [key: string]: MerlinsPool[] }>(lpTokensUrl)).data

  const lpTokens = Object.entries(lpTokenData).reduce<MerlinsCoin[]>((acc, current) => {
    if (!current) return acc

    const [poolId, tokenPair] = current

    const coin: MerlinsCoin = {
      price: 0,
      denom: `gamm/pool/${poolId}`,
      symbol: `gamm/pool/${poolId}`,
      liquidity: tokenPair[0].liquidity,
      liquidity_24h_change: tokenPair[0].liquidity_24h_change,
      volume_24h: tokenPair[0].volume_24h,
      volume_24h_change: tokenPair[0].volume_24h_change,
      name: `Merlins ${tokenPair[0].symbol}/${tokenPair[1].symbol} LP Token`,
      price_24h_change: 0,
    }
    acc.push(coin)
    return acc
  }, [])

  return [...lpTokens, ...tokens]
}

export const parseMerlinsData = (data: MerlinsCoin[]) => {
  const results = data.reduce((acc, { denom, symbol }) => {
    // denoms for non native assets are formatted like so: 'ibc/27394...'
    const isNativeAsset = !denom.split('/')[1]
    const isLpToken = denom.startsWith('gamm/pool/')
    const isOsmo = denom === 'uosmo'

    let assetNamespace: AssetNamespace
    let assetReference

    if (isNativeAsset) {
      assetReference = isOsmo ? ASSET_REFERENCE.Merlins : denom
      assetNamespace = isOsmo ? 'slip44' : 'native'
    } else {
      assetReference = isLpToken ? denom : denom.split('/')[1]
      assetNamespace = 'ibc'
    }

    const chainNamespace = CHAIN_NAMESPACE.CosmosSdk
    const chainReference = CHAIN_REFERENCE.MerlinsMainnet
    const assetId = toAssetId({ chainNamespace, chainReference, assetNamespace, assetReference })

    acc[assetId] = symbol
    return acc
  }, {} as Record<string, string>)

  return results
}

export const parseData = (d: MerlinsCoin[]) => {
  const merlinsMainnet = toChainId({
    chainNamespace: CHAIN_NAMESPACE.CosmosSdk,
    chainReference: CHAIN_REFERENCE.MerlinsMainnet,
  })

  return {
    [merlinsMainnet]: parseMerlinsData(d),
  }
}

export const isMerlinsLpAsset = (assetReference: AssetReference | string): boolean => {
  return assetReference.startsWith('gamm/pool/')
}

export const isNumeric = (s: string): boolean => {
  if (typeof s !== 'string') return false
  if (s.trim() === '') return false
  return !Number.isNaN(Number(s))
}
