'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  BarChart, Settings, User, Database, 
  Bell, Shield, HelpCircle, X, Brain, Key, Target
} from 'lucide-react'
import { ExtendedThinkingSettings } from './ExtendedThinkingSettings'
import { ExpertModeSettings } from './ExpertModeSettings'
import { ApiKeySettings } from './ApiKeySettings'
import { HelpAbout } from './HelpAbout'

interface SettingsMenuProps {
  isOpen: boolean
  onClose: () => void
  onOpenSessionManagement: () => void
  initialSection?: string
}

export function SettingsMenu({ 
  isOpen, 
  onClose,
  onOpenSessionManagement,
  initialSection
}: SettingsMenuProps) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement>>({})
  const helpSectionRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
      // Reset scroll position when closing
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0
      }
    }, 150)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      handleClose()
    }
  }

  // State for active settings section
  const [activeSection, setActiveSection] = useState<string | null>(initialSection || null)
  
  // Update active section when initialSection changes
  useEffect(() => {
    if (initialSection && isOpen) {
      setActiveSection(initialSection)
    }
  }, [initialSection, isOpen])
  
  // Scroll to active section when it changes
  useEffect(() => {
    if (activeSection && sectionRefs.current[activeSection] && scrollContainerRef.current) {
      // Small delay to allow content to render
      setTimeout(() => {
        const element = sectionRefs.current[activeSection]
        const container = scrollContainerRef.current
        
        if (element && container) {
          // Get the parent section div (the one with p-4 class)
          const sectionDiv = element.closest('.p-4')
          const elementToScroll = sectionDiv || element
          
          // Calculate position to scroll to
          const elementTop = elementToScroll.offsetTop
          const containerHeight = container.clientHeight
          const containerScrollHeight = container.scrollHeight
          
          // The scroll container starts below the header, so we need to calculate
          // positions relative to the container, not the modal
          
          // Find the section container that has the "HELP" title
          const helpSection = Array.from(container.querySelectorAll('[data-section]'))
            .find(el => el.getAttribute('data-section') === 'Help')
          
          if (activeSection === 'help-about' && helpSection) {
            // Get the position relative to the scroll container
            const containerRect = container.getBoundingClientRect()
            const sectionRect = helpSection.getBoundingClientRect()
            
            // Calculate how much to scroll
            // We want the section to appear at the top of the scroll container
            const currentScrollTop = container.scrollTop
            const relativeTop = sectionRect.top - containerRect.top
            const scrollTop = currentScrollTop + relativeTop
            
            container.scrollTo({
              top: scrollTop,
              behavior: 'smooth'
            })
          } else {
            // For other sections, find their parent section container
            const parentSection = element.closest('[data-section]')
            if (parentSection) {
              const containerRect = container.getBoundingClientRect()
              const sectionRect = parentSection.getBoundingClientRect()
              
              const currentScrollTop = container.scrollTop
              const relativeTop = sectionRect.top - containerRect.top
              const scrollTop = currentScrollTop + relativeTop
              
              container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
              })
            } else {
              // Fallback to element position
              const scrollTop = Math.max(0, elementTop - 20)
              container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
              })
            }
          }
        }
      }, 150) // Slightly longer delay to ensure content is rendered
    }
  }, [activeSection])
  
  // Handle click on settings item
  const handleSettingsClick = (section: string) => {
    setActiveSection(prev => prev === section ? null : section)
  }
  
  const menuSections = [
    {
      title: 'Analysis',
      items: [
        {
          icon: BarChart,
          label: 'Analytics Dashboard',
          onClick: () => {
            handleClose()
            router.push('/analytics')
          }
        }
      ]
    },
    {
      title: 'Management',
      items: [
        {
          icon: Database,
          label: 'Session Management',
          onClick: () => {
            handleClose()
            onOpenSessionManagement()
          }
        }
      ]
    },
    {
      title: 'AI Features',
      items: [
        {
          icon: Target,
          label: 'Expert Mode',
          onClick: () => handleSettingsClick('expert-mode'),
          active: activeSection === 'expert-mode',
          content: <ExpertModeSettings />
        },
        {
          icon: Brain,
          label: 'Extended Thinking',
          onClick: () => handleSettingsClick('extended-thinking'),
          active: activeSection === 'extended-thinking',
          content: <ExtendedThinkingSettings />
        }
      ]
    },
    {
      title: 'Settings',
      items: [
        {
          icon: Key,
          label: 'API Keys',
          onClick: () => handleSettingsClick('api-keys'),
          active: activeSection === 'api-keys',
          content: <ApiKeySettings onSuccess={handleClose} />
        },
        {
          icon: Bell,
          label: 'Notifications',
          onClick: () => console.log('Notifications clicked')
        },
        {
          icon: Shield,
          label: 'Security',
          onClick: () => console.log('Security clicked')
        },
        {
          icon: User,
          label: 'Profile',
          onClick: () => console.log('Profile clicked')
        }
      ]
    },
    {
      title: 'Help',
      items: [
        {
          icon: HelpCircle,
          label: 'Help & About',
          onClick: () => handleSettingsClick('help-about'),
          active: activeSection === 'help-about',
          content: <HelpAbout />
        }
      ]
    }
  ]

  if (!isOpen) return null

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 
                 transition-opacity duration-150 
                 ${closing ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`absolute right-0 top-0 h-full w-80 bg-white shadow-xl
                   transform transition-transform duration-150
                   ${closing ? 'translate-x-full' : 'translate-x-0'}`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Settings</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div ref={scrollContainerRef} className="overflow-y-auto h-[calc(100%-4rem)]">
          {menuSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="p-4" data-section={section.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item: any, itemIndex) => {
                  // For items with active sections, use the activeSection value
                  const sectionKey = item.active !== undefined && activeSection ? activeSection : null;
                  
                  return (
                    <li key={itemIndex} className="space-y-2">
                      <div ref={el => {
                        if (el && sectionKey && item.active) {
                          sectionRefs.current[sectionKey] = el
                        }
                      }}>
                        <button
                          onClick={item.onClick}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-gray-700
                                   hover:bg-gray-50 rounded-lg transition-colors
                                   ${item.active ? 'bg-indigo-50 text-indigo-700' : ''}`}
                        >
                          <item.icon className={`h-5 w-5 ${item.active ? 'text-indigo-600' : 'text-gray-500'}`} />
                          <span>{item.label}</span>
                        </button>
                        
                        {/* Show content if active */}
                        {item.active && item.content && (
                          <div className="mt-3 px-3 pb-2">
                            {item.content}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {sectionIndex < menuSections.length - 1 && (
                <div className="mt-4 border-t border-gray-100" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}