import { ArrowDownIcon, ArrowUpIcon } from '@chakra-ui/icons'
import { Center } from '@chakra-ui/react'
import type { AccountId } from '@shapeshiftoss/caip'
import { ASSET_NAMESPACE, toAssetId } from '@shapeshiftoss/caip'
import { DefiModalContent } from 'features/defi/components/DefiModal/DefiModalContent'
import { Overview } from 'features/defi/components/Overview/Overview'
import type {
  DefiParams,
  DefiQueryParams,
} from 'features/defi/contexts/DefiManagerProvider/DefiCommon'
import { DefiAction } from 'features/defi/contexts/DefiManagerProvider/DefiCommon'
import { useEffect, useMemo } from 'react'
import type { AccountDropdownProps } from 'components/AccountDropdown/AccountDropdown'
import { CircularProgress } from 'components/CircularProgress/CircularProgress'
import { useBrowserRouter } from 'hooks/useBrowserRouter/useBrowserRouter'
import type { Asset } from 'lib/asset-service'
import { bn, bnOrZero } from 'lib/bignumber/bignumber'
import { useGetAssetDescriptionQuery } from 'state/slices/assetsSlice/assetsSlice'
import type { LpId } from 'state/slices/opportunitiesSlice/types'
import { makeDefiProviderDisplayName, toOpportunityId } from 'state/slices/opportunitiesSlice/utils'
import {
  selectAssetById,
  selectEarnUserLpOpportunity,
  selectHighestBalanceAccountIdByLpId,
  selectMarketDataById,
  selectSelectedLocale,
  selectUnderlyingLpAssetsWithBalancesAndIcons,
} from 'state/slices/selectors'
import { useAppSelector } from 'state/store'

type MerlinsOverviewProps = {
  accountId: AccountId | undefined
  onAccountIdChange: AccountDropdownProps['onChange']
}

export const MerlinsLpOverview: React.FC<MerlinsOverviewProps> = ({
  accountId,
  onAccountIdChange: handleAccountIdChange,
}) => {
  const { query } = useBrowserRouter<DefiQueryParams, DefiParams>()
  const { chainId, assetReference } = query
  const assetNamespace = ASSET_NAMESPACE.ibc

  const assetId = toAssetId({ chainId, assetNamespace, assetReference })

  const merlinsOpportunityId: LpId | undefined = useMemo(
    () => (assetId ? toOpportunityId({ chainId, assetNamespace, assetReference }) : undefined),
    [assetId, assetNamespace, assetReference, chainId],
  )

  const highestBalanceAccountIdFilter = useMemo(
    () => ({ lpId: merlinsOpportunityId }),
    [merlinsOpportunityId],
  )
  const highestBalanceAccountId = useAppSelector(state =>
    selectHighestBalanceAccountIdByLpId(state, highestBalanceAccountIdFilter),
  )

  const maybeAccountId = accountId ?? highestBalanceAccountId

  useEffect(() => {
    if (!maybeAccountId) return
    handleAccountIdChange(maybeAccountId)
  }, [handleAccountIdChange, maybeAccountId])

  const opportunityDataFilter = useMemo(
    () => ({
      lpId: merlinsOpportunityId,
      assetId,
      accountId: maybeAccountId,
    }),
    [assetId, maybeAccountId, merlinsOpportunityId],
  )

  const merlinsOpportunity = useAppSelector(state =>
    selectEarnUserLpOpportunity(state, opportunityDataFilter),
  )

  const lpAssetId = toAssetId({
    chainId,
    assetNamespace,
    assetReference,
  })

  const lpAsset: Asset | undefined = useAppSelector(state => selectAssetById(state, lpAssetId))

  const underlyingAssetsWithBalancesAndIcons = useAppSelector(state =>
    selectUnderlyingLpAssetsWithBalancesAndIcons(state, opportunityDataFilter),
  )

  const lpMarketData = useAppSelector(state => selectMarketDataById(state, lpAssetId))
  const opportunityFiatBalance = bnOrZero(merlinsOpportunity?.cryptoAmountBaseUnit)
    .div(bn(10).pow(lpAsset?.precision ?? 0))
    .times(lpMarketData.price)
    .toFixed()

  const selectedLocale = useAppSelector(selectSelectedLocale)
  const descriptionQuery = useGetAssetDescriptionQuery({
    assetId: lpAsset?.assetId,
    selectedLocale,
  })

  if (!(lpAsset && merlinsOpportunity?.opportunityName && underlyingAssetsWithBalancesAndIcons))
    return (
      <DefiModalContent>
        <Center minW='350px' minH='350px'>
          <CircularProgress isIndeterminate />
        </Center>
      </DefiModalContent>
    )

  return (
    <Overview
      accountId={accountId}
      onAccountIdChange={handleAccountIdChange}
      asset={lpAsset}
      icons={merlinsOpportunity.icons}
      name={merlinsOpportunity.opportunityName}
      opportunityFiatBalance={opportunityFiatBalance}
      underlyingAssetsCryptoPrecision={underlyingAssetsWithBalancesAndIcons}
      provider={makeDefiProviderDisplayName({
        provider: merlinsOpportunity.provider,
        assetName: lpAsset.name,
      })}
      description={{
        description: lpAsset?.description,
        isLoaded: !descriptionQuery.isLoading,
        isTrustedDescription: lpAsset?.isTrustedDescription,
      }}
      tvl={bnOrZero(merlinsOpportunity.tvl).toFixed(2)}
      apy={merlinsOpportunity.apy}
      menu={[
        {
          label: 'common.deposit',
          icon: <ArrowUpIcon />,
          action: DefiAction.Deposit,
        },
        {
          label: 'common.withdraw',
          icon: <ArrowDownIcon />,
          action: DefiAction.Withdraw,
        },
      ]}
    />
  )
}
