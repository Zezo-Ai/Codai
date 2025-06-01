'use client'

import { FC, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  id: string
  content: React.ReactNode
  triggerRef: React.RefObject<HTMLElement>
}

export const Tooltip: FC<Props> = ({ id, content, triggerRef }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [show, setShow] = useState(false)

  useEffect(() => {
    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + window.scrollY + 8, // 8px offset from element
          left: rect.left + window.scrollX + (rect.width / 2) // Center align
        })
      }
    }

    // Update position on mount and window resize
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    // Cleanup
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [triggerRef])

  // Only render if we have a document (client-side)
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      id={id}
      className={`fixed z-50 transform -translate-x-1/2 ${show ? 'block' : 'hidden'}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="bg-gray-900 text-white text-xs rounded shadow-lg p-2 pointer-events-auto">
        {content}
      </div>
    </div>,
    document.body
  )
}