import { IdlAccounts, ProgramAccount } from '@coral-xyz/anchor'
import { FC } from 'react'
import { QuestBoard } from '../types/quest_board'
import bs58 from 'bs58'
import { useAtomValue } from 'jotai'
import { questDetailsAtom } from '../atoms/questDetailsAtom'
import { formatNumber } from '../utils/formatNumber'
import cn from 'classnames'
import { Link } from 'react-router-dom'
import { userConnectionStatusAtom } from '../atoms/userConnectionStatusAtom'
import { trimAddress } from '../utils/trimAddress'
import { searchAtom } from '../atoms/searchAtom'
import { useUserWallet } from '../atoms/userWalletAtom'

export const QuestCard: FC<
  ProgramAccount<IdlAccounts<QuestBoard>['quest']>
> = ({ account, publicKey }) => {
  const wallet = useUserWallet()
  const id = account.id.toBase58()
  const hash = bs58.encode(account.detailsHash)
  const details = useAtomValue(questDetailsAtom(id + '_' + hash))
  const connectionStatus = useAtomValue(
    userConnectionStatusAtom(account.owner.toBase58())
  )
  const searchFilter = useAtomValue(searchAtom)

  if (!details) return null

  let search = searchFilter.toLowerCase()
  if (search.startsWith('reward')) {
    search = search.replace('reward', '').replace(':', '').trim()

    if (!details.reward.toLowerCase().includes(search)) {
      return null
    }
  } else if (!details.title.toLowerCase().includes(search)) {
    return null
  }

  const staked = account.staked.toNumber() / 10 ** 9
  const minStakeRequired = account.minStakeRequired.toNumber() / 10 ** 9

  const questOwner = wallet?.publicKey && account.owner.equals(wallet.publicKey)

  return (
    <Link
      to={`/quest/${publicKey.toBase58()}`}
      className={cn(
        !connectionStatus
          ? 'text-slate-300 bg-gray-800 brightness-90'
          : 'bg-gradient-to-tr from-gray-700 via-gray-800 to-slate-700',
        'rounded',
        'break-inside-avoid',
        'p-5 flex flex-col gap-5',
        'animate-fadeIn transition-all'
      )}
    >
      <div className='flex flex-col gap-3'>
        <h2 className='text-2xl font-cursive font-bold break-words'>
          {details.title}
        </h2>
        <h2 className='text-xs font-bold uppercase tracking-wider opacity-80 text-yellow-100'>
          Reward: {details.reward}
        </h2>
      </div>
      <div className=' break-words text-sm'>{details.description}</div>
      <div className='border-b border-dashed border-white/25 mt-auto' />
      <div className='flex flex-col gap-2 text-xs'>
        <div className='flex items-center gap-2'>
          <span>Owner: </span>
          <span className='font-bold flex items-center gap-2'>
            <span>
              {questOwner
                ? 'You own this Quest'
                : trimAddress(account.owner.toBase58())}
            </span>
            {connectionStatus && !questOwner && (
              <span
                className={cn('rounded-full w-2 h-2 flex-none', 'bg-green-500')}
              />
            )}
          </span>
        </div>
        <div className='grid grid-cols-2 gap-5'>
          <div className='flex items-center justify-between gap-2'>
            <span>Staked: </span>
            <span className='font-bold text-right'>
              {staked > 0 ? formatNumber(staked + '') : 'None'}
            </span>
          </div>
          <div className='flex items-center justify-between gap-2'>
            <span>Min Stake: </span>
            <span className='font-bold text-right'>
              {minStakeRequired > 0
                ? formatNumber(minStakeRequired + '')
                : 'None'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
