import { FC, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Notification,
  NotificationMessage,
  NotificationMessageType,
} from '../atoms/notificationsAtom'
import { decryptMessage, deriveSharedSecret } from '../utils/crypto'
import { getSessionKeypair } from '../utils/getSessionKeypair'
import { useUserWallet } from '../atoms/userWalletAtom'
import { trimAddress } from '../utils/trimAddress'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAtomValue, useSetAtom } from 'jotai'
import { userConnectionStatusAtom } from '../atoms/userConnectionStatusAtom'
import cn from 'classnames'
import { Signature, TrashSimple, Warning, X } from '@phosphor-icons/react'
import { questAtom } from '../atoms/questsAtom'
import { Link, useNavigate } from 'react-router-dom'
import { formatNumber } from '../utils/formatNumber'
import { myRoomWebsocketAtom } from '../atoms/myRoomWebsocketAtom'
import { sendNotification } from '../utils/sendNotification'
import { programAtom } from '../atoms/programAtom'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import CooldownTimer from './CooldownTimer'
import { questsListTabAtom } from '../atoms/questsListTabAtom'
import { idbAtom } from '../atoms/idbAtom'
import { joinQuestRoom } from '../utils/joinQuestRoom'

dayjs.extend(relativeTime)

const Card: FC<{
  children: ReactNode
  messageType: NotificationMessageType
  fromAddress: string
  isOnline: boolean
  since: string
  onDelete: () => void
}> = ({ children, messageType, fromAddress, isOnline, since, onDelete }) => {
  const tag = useMemo(() => {
    switch (messageType) {
      case NotificationMessageType.QUEST_PROPOSAL:
        return { label: `Offer by `, color: 'border-blue-500' }
      case NotificationMessageType.QUEST_ACCEPTED:
        return { label: `Approved by `, color: 'border-green-500' }
      case NotificationMessageType.QUEST_REJECTED:
        return { label: `Declined by `, color: 'border-red-500' }
      case NotificationMessageType.QUEST_CANCELED:
        return { label: `Canceled by `, color: 'border-slate-500' }
      case NotificationMessageType.QUEST_SETTLED:
        return { label: `Settled by `, color: 'border-blue-500' }
    }
  }, [messageType])

  return (
    <div className='flex flex-col gap-5'>
      <div className='flex justify-between items-start'>
        <span
          className={cn(
            tag.color,
            'border-l-8 pl-2',
            'flex items-center gap-x-2 text-sm flex-wrap'
          )}
        >
          <span>
            <span className='opacity-75'>{tag.label}</span>
            <span className='font-bold'>{fromAddress}</span>
          </span>
          <span
            className={cn(
              isOnline ? 'bg-green-500' : 'bg-red-500',
              'rounded-full w-2 h-2 flex-none'
            )}
          />
          <span className='opacity-75'>{since}</span>
        </span>
        <div className='flex items-center justify-center gap-2 h-5 w-5'>
          <button onClick={onDelete}>
            <TrashSimple size={16} />
          </button>
        </div>
      </div>

      {children}
      <div className='border-b border-dashed border-white/25 mb-5' />
    </div>
  )
}

export const NotificationCard: FC<{ notification: Notification }> = ({
  notification,
}) => {
  const wallet = useUserWallet()
  const program = useAtomValue(programAtom)
  const [messageDetails, setMessage] = useState<NotificationMessage | null>(
    null
  )
  const [decryptionError, setDecryptionError] = useState<string | null>(null)
  const isVisitorOnline = useAtomValue(
    userConnectionStatusAtom(notification.visitorAddress)
  )
  const questDetails = useAtomValue(questAtom(messageDetails?.quest ?? ''))
  const ws = useAtomValue(myRoomWebsocketAtom)
  const [busy, setBusy] = useState(false)
  const since = dayjs(notification.timestamp).fromNow()
  const [cooldown, setCooldown] = useState<number | null>(null)
  const setTab = useSetAtom(questsListTabAtom)
  const navigate = useNavigate()
  const idb = useAtomValue(idbAtom)

  useEffect(() => {
    if (!idb) return
    if (!wallet?.publicKey) return
    if (!notification.message) return
    if (!ws) return

    const myAddress = wallet.publicKey.toBase58()
    const keypair = getSessionKeypair(myAddress)

    if (!keypair) {
      setDecryptionError('Session keypair does not exists.')
      return
    }

    deriveSharedSecret(keypair, notification.visitorNotifAddress)
      .then((secret) => {
        return decryptMessage(notification.message, secret)
      })
      .then((decryptedMessage) => {
        let message = null
        try {
          message = JSON.parse(decryptedMessage)
        } catch (e) {
          console.error(e)
        }

        if (
          (notification.messageType ===
            NotificationMessageType.QUEST_CANCELED ||
            notification.messageType ===
              NotificationMessageType.QUEST_SETTLED) &&
          message.cancelId
        ) {
          ws?.send(
            JSON.stringify({
              type: 'delete_notification',
              id: message.cancelId,
            })
          )
          if (
            notification.messageType === NotificationMessageType.QUEST_SETTLED
          ) {
            joinQuestRoom(myAddress, message.quest)
              .then((sessionKeypair) => {
                if (sessionKeypair) {
                  return idb.put('session_keys', {
                    id: sessionKeypair.publicKey.toBase58(),
                    downloaded: false,
                    keypair: sessionKeypair.secretKey,
                  })
                }
              })
              .then(() => {
                setTab('ongoing')

                ws?.send(
                  JSON.stringify({
                    type: 'delete_notification',
                    id: notification.id,
                  })
                )

                navigate(`/quest/${message.quest}/chat`)
              })
          }
        }

        setMessage(message)
      })
      .catch((e) => {
        console.error(e)
        setDecryptionError('Unable to decrypt message.')
      })
  }, [
    wallet,
    ws,
    notification.message,
    notification.messageType,
    notification.visitorNotifAddress,
    navigate,
    setTab,
  ])

  const onDelete = () => {
    if (!ws) return
    ws.send(
      JSON.stringify({
        type: 'delete_notification',
        id: notification.id,
      })
    )
  }

  const onDecline = async () => {
    if (!wallet?.publicKey) return
    if (!notification.visitorAddress) return
    if (!messageDetails) return
    setBusy(true)

    try {
      const message = JSON.stringify(messageDetails)

      await sendNotification(
        wallet.publicKey.toBase58(),
        notification.visitorAddress,
        message,
        NotificationMessageType.QUEST_REJECTED
      )

      ws?.send(
        JSON.stringify({
          type: 'delete_notification',
          id: notification.id,
        })
      )
    } catch (e) {
      console.error(e)
      setBusy(false)
    }
  }

  const onApprove = async () => {
    if (!idb) return
    if (!program) return
    if (!wallet?.publicKey) return
    if (!wallet?.signTransaction) return
    if (!messageDetails) return

    setBusy(true)

    try {
      const stakeAmount = new BN(messageDetails.minStake * 10 ** 9)
      // todo: replace messageString with messageDetails.content only
      const messageString = JSON.stringify({
        quest: messageDetails.quest,
        content: messageDetails.content,
        minStake: messageDetails.minStake,
      })
      const offereeProposalHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            Buffer.from(messageString, 'utf-8')
          )
        )
      )

      await idb.put(
        'proposal_hash',
        messageString,
        bs58.encode(offereeProposalHash)
      )

      const ixAcceptQuest = await program.methods
        .acceptQuest({
          stakeAmount,
          offereeProposalHash,
        })
        .accounts({
          offeree: new PublicKey(notification.visitorAddress),
        })
        .accountsPartial({
          quest: new PublicKey(messageDetails.quest),
        })
        .instruction()

      let tx = new Transaction()
      tx.add(ixAcceptQuest)
      tx.feePayer = wallet.publicKey

      const { blockhash } =
        await program.provider.connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash

      tx = await wallet.signTransaction(tx)
      const serializedTx = bs58.encode(
        tx.serialize({ requireAllSignatures: false })
      )

      await sendNotification(
        wallet.publicKey.toBase58(),
        notification.visitorAddress,
        JSON.stringify({
          ...messageDetails,
          cancelId: notification.id,
          serializedTx,
        } as NotificationMessage),
        NotificationMessageType.QUEST_ACCEPTED
      )

      setCooldown(Date.now() + 180000)
    } catch (e) {
      console.error(e)
    }

    setBusy(false)
  }

  const onSign = async () => {
    // todo: validate transaction
    if (!idb) return
    if (!program) return
    if (!wallet?.publicKey) return
    if (!wallet?.signTransaction) return
    if (!messageDetails?.serializedTx) return

    // todo: replace date now with something reliable
    if (notification.timestamp + 180000 < Date.now()) {
      alert(
        'Transaction is already expired. Please wait for the Quest owner to submit a new one.'
      )
      onDelete()
      return
    }

    setBusy(true)

    try {
      let tx = Transaction.from(
        bs58.decode(messageDetails.serializedTx)
      ) as Transaction

      tx = await wallet.signTransaction(tx)

      const signature = await program.provider.connection.sendRawTransaction(
        tx.serialize(),
        {
          skipPreflight: true,
        }
      )
      // todo: replace with confirmation strategy
      await program.provider.connection.confirmTransaction(signature)

      const myAddress = wallet.publicKey.toBase58()

      const sessionKeypair = await joinQuestRoom(
        myAddress,
        messageDetails.quest
      )

      if (sessionKeypair) {
        await idb.put('session_keys', {
          id: sessionKeypair.publicKey.toBase58(),
          downloaded: false,
          keypair: sessionKeypair.secretKey,
        })
      }

      await sendNotification(
        myAddress,
        notification.visitorAddress,
        JSON.stringify(messageDetails),
        NotificationMessageType.QUEST_SETTLED
      )

      setTab('ongoing')

      ws?.send(
        JSON.stringify({
          type: 'delete_notification',
          id: notification.id,
        })
      )

      navigate(`/quest/${messageDetails.quest}/chat`)
    } catch (e) {
      console.log(e)
      setBusy(false)
    }
  }

  const onCancel = async () => {
    if (!wallet?.publicKey) return
    if (!notification.visitorAddress) return
    if (!messageDetails?.cancelId) return
    setBusy(true)

    try {
      const message = JSON.stringify(messageDetails)

      await sendNotification(
        wallet.publicKey.toBase58(),
        notification.visitorAddress,
        message,
        NotificationMessageType.QUEST_CANCELED
      )

      ws?.send(
        JSON.stringify({
          type: 'delete_notification',
          id: notification.id,
        })
      )
    } catch (e) {
      console.error(e)
      setBusy(false)
    }
  }

  if (notification.messageType === NotificationMessageType.QUEST_SETTLED) {
    return null
  }

  if (decryptionError) {
    return (
      <Card
        messageType={notification.messageType}
        fromAddress={trimAddress(notification.visitorAddress)}
        isOnline={isVisitorOnline ?? false}
        since={since}
        onDelete={onDelete}
      >
        <p className='text-red-500 flex gap-2 items-center'>
          <Warning size={20} />
          <span>{decryptionError}</span>
        </p>
      </Card>
    )
  }

  return (
    <Card
      messageType={notification.messageType}
      fromAddress={trimAddress(notification.visitorAddress)}
      isOnline={isVisitorOnline ?? false}
      since={since}
      onDelete={onDelete}
    >
      {messageDetails && (
        <>
          {notification.messageType ===
            NotificationMessageType.QUEST_ACCEPTED && (
            <div>
              Your offer has been approved. Please respond immediately to avoid
              a stale transaction.
            </div>
          )}
          {notification.messageType ===
            NotificationMessageType.QUEST_REJECTED && (
            <div>Your offer has been declined.</div>
          )}
          {notification.messageType ===
            NotificationMessageType.QUEST_CANCELED && (
            <div>The offer has been canceled.</div>
          )}
          <div
            className={cn(
              (notification.messageType ===
                NotificationMessageType.QUEST_ACCEPTED ||
                notification.messageType ===
                  NotificationMessageType.QUEST_REJECTED ||
                notification.messageType ===
                  NotificationMessageType.QUEST_CANCELED) &&
                'px-3 py-2 bg-black/5',
              'flex flex-col gap-3 '
            )}
          >
            <p className=''>{messageDetails.content}</p>
            {questDetails?.details && (
              <div className='flex flex-col gap-2 text-xs'>
                <div className='flex items-center gap-2'>
                  <span>For Quest: </span>
                  <span className='font-bold flex items-center gap-2'>
                    <Link
                      to={`/quest/${messageDetails.quest}`}
                      className='text-sm font-bold break-words'
                    >
                      {questDetails.details.title}
                    </Link>
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <span>Stake Offered: </span>
                  <span
                    className={cn(
                      messageDetails.minStake === 0 && 'text-red-500',
                      'font-bold flex items-center gap-2'
                    )}
                  >
                    {messageDetails.minStake === 0
                      ? 'None'
                      : formatNumber(messageDetails.minStake + '')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {notification.messageType === NotificationMessageType.QUEST_PROPOSAL && (
        <div className='flex gap-5'>
          <div
            className={cn(
              'flex-1',
              isVisitorOnline && !cooldown && 'bg-green-800/50 '
            )}
          >
            <button
              type='submit'
              onClick={onApprove}
              disabled={busy || !isVisitorOnline || cooldown !== null}
              className={cn(
                busy || !isVisitorOnline || cooldown !== null
                  ? 'opacity-50 pointer-events-none cursor-wait'
                  : 'cursor-pointer',
                'w-full px-3 py-2 flex items-center justify-center gap-3',
                'bg-gray-300/10 hover:bg-gray-300/30 transition-colors'
              )}
            >
              <Signature size={32} />
              {isVisitorOnline ? (
                <span>{busy ? 'Waiting' : 'Approve'}</span>
              ) : (
                <span>Offline</span>
              )}
              {!!cooldown && (
                <CooldownTimer
                  dateTo={cooldown}
                  format='[(]m:ss[)]'
                  trigger={() => setCooldown(null)}
                />
              )}
            </button>
          </div>
          {cooldown === null && (
            <div className='bg-red-800/50  flex-1'>
              <button
                type='submit'
                onClick={onDecline}
                disabled={busy}
                className={cn(
                  busy
                    ? 'opacity-50 pointer-events-none cursor-wait'
                    : 'cursor-pointer',
                  'w-full px-3 py-2 flex items-center justify-center gap-3',
                  'bg-gray-300/10 hover:bg-gray-300/30 transition-colors'
                )}
              >
                <X size={32} />
                <span>Decline</span>
              </button>
            </div>
          )}
        </div>
      )}
      {notification.messageType === NotificationMessageType.QUEST_ACCEPTED && (
        <div className='flex gap-5'>
          <div className={cn('flex-1', 'bg-green-800/50 ')}>
            <button
              type='submit'
              onClick={onSign}
              disabled={busy}
              className={cn(
                busy
                  ? 'opacity-50 pointer-events-none cursor-wait'
                  : 'cursor-pointer',
                'w-full px-3 py-2 flex items-center justify-center gap-3',
                'bg-gray-300/10 hover:bg-gray-300/30 transition-colors'
              )}
            >
              <Signature size={32} />
              <span>Sign</span>
            </button>
          </div>
          <div className='bg-red-800/50  flex-1'>
            <button
              type='submit'
              onClick={onCancel}
              disabled={busy}
              className={cn(
                busy
                  ? 'opacity-50 pointer-events-none cursor-wait'
                  : 'cursor-pointer',
                'w-full px-3 py-2 flex items-center justify-center gap-3',
                'bg-gray-300/10 hover:bg-gray-300/30 transition-colors'
              )}
            >
              <X size={32} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
