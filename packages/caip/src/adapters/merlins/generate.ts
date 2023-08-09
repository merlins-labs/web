import { merlinsGetLpTokensUrl, merlinsGetTokensUrl } from './index'
import { fetchData, parseData, writeFiles } from './utils'

const main = async () => {
  const data = await fetchData({
    tokensUrl: merlinsGetTokensUrl,
    lpTokensUrl: merlinsGetLpTokensUrl,
  })
  const output = parseData(data)
  await writeFiles(output)
}

main()
