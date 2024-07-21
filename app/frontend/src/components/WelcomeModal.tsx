import { FC, useState } from 'react'
import { useUserWallet } from '../atoms/userWalletAtom'
import { useAtom, useAtomValue } from 'jotai'
import { userDetailsAtom } from '../atoms/userDetailsAtom'
import Dialog from './Dialog'
import { ScrollableContent } from './ScrollableContent'
import cn from 'classnames'
import TimeInput from './TimeInput'
import { Keypair } from '@solana/web3.js'
import { X } from '@phosphor-icons/react'
import bs58 from 'bs58'

export const WelcomeModal: FC = () => {
  const wallet = useUserWallet()
  const [info, refreshInfo] = useAtom(
    userDetailsAtom(wallet?.publicKey?.toBase58() ?? '')
  )
  const [start, setStart] = useState('8.0.AM')
  const [end, setEnd] = useState('8.0.PM')
  const [busy, setBusy] = useState(false)

  const onSubmit = async () => {
    if (!wallet) return
    setBusy(true)
    try {
      const sessionKeypair = Keypair.generate()
      const message = `I agree with QuestBoard's terms and privacy policy. ${sessionKeypair.publicKey.toBase58()}`
      const signature = await wallet.signMessage(Buffer.from(message))

      const payload = {
        sessionAddress: sessionKeypair.publicKey.toBase58(),
        signature: bs58.encode(signature),
        availableStart: start,
        availableEnd: end,
      }

      const response = await fetch(
        `http://192.168.1.32:1999/parties/main/userinfo_${wallet.publicKey.toBase58()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to create user details')
      }

      refreshInfo()

      // store sessionKeypair
      window.localStorage.setItem(
        'sessionAddress',
        bs58.encode(sessionKeypair.secretKey)
      )
    } catch (err) {
      console.error(err)
    }
    setBusy(false)
  }

  return (
    <Dialog show={info === 'unregistered'}>
      <ScrollableContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (busy) return
            onSubmit()
          }}
          className={cn(
            'flex flex-col gap-5',
            'mx-auto max-w-md w-full bg-amber-100 text-amber-950 px-5 pb-5 pt-4'
          )}
        >
          <h2 className='font-cursive text-2xl flex items-center justify-between py-1 sticky top-0 bg-amber-100 z-10'>
            <span className='font-bold'>Welcome to QuestBoard!</span>
            <button type='button' onClick={() => wallet?.disconnect()}>
              <X size={24} />
            </button>
          </h2>
          <p>
            Please provide your availability so that other users know when they
            can reach you.
          </p>

          <div className='flex flex-col gap-1'>
            <span className='text-xs uppercase tracking-wider font-bold opacity-50'>
              Available From
            </span>
            <TimeInput value={start} onChange={setStart} />
          </div>
          <div className='flex flex-col gap-1'>
            <span className='text-xs uppercase tracking-wider font-bold opacity-50'>
              To
            </span>
            <TimeInput value={end} onChange={setEnd} />
          </div>
          <div className='border-b border-dashed border-amber-950' />
          <div className='flex flex-col gap-1'>
            <span className='text-xs uppercase tracking-wider font-bold opacity-50'>
              Disclosure
            </span>
            <p className='text-sm'>
              By submitting, you agree to our{' '}
              <span className='font-bold'>terms and conditions</span> and{' '}
              <span className='font-bold'>privacy policy</span>. The team behind
              this dApp is not responsible for any loss of funds or damages
              caused by the use of this application.
            </p>
          </div>
          <div className='bg-black/50 text-white'>
            <button
              type='submit'
              disabled={busy}
              className={cn(
                busy
                  ? 'opacity-50 pointer-events-none cursor-wait'
                  : 'cursor-pointer',
                'w-full px-3 py-2 flex items-center justify-center gap-3',
                'bg-amber-300/10 hover:bg-amber-300/30 transition-colors'
              )}
            >
              <span>{busy ? 'Please Wait' : 'Sign & Submit'}</span>
            </button>
          </div>
        </form>
      </ScrollableContent>
    </Dialog>
  )
}
