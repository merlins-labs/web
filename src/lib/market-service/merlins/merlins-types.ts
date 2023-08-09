export type MerlinsMarketCap = {
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

export type MerlinsHistoryData = {
  time: number
  close: number
  high: number
  low: number
  open: number
  volume: number
}

export type MerlinsMarketData = {
  symbol: string
  amount: number
  denom: string
  coingecko_id: string
  liquidity: number
  liquidity_24h_change: number
  volume_24h: number
  volume_24h_change: number
  price: number
  price_24h_change: number
  fees: string
}

export type MerlinsToken = {
  denom: string
  amount: string
}

export type MerlinsPoolAsset = {
  token: MerlinsToken
  weight: string
}

export type MerlinsPool = {
  '@type': string
  name: string
  address: string
  id: string
  pool_params: {
    swap_fee: string
    exit_fee: string
    smooth_weight_change_params: boolean
  }
  future_pool_governor: string
  total_shares: {
    denom: string
    amount: string
  }
  pool_assets: MerlinsPoolAsset[]
  total_weight: string
  apy: string
  tvl: string
}
