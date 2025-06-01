'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import StateVisualizer from './StateVisualizer'
import { saveStreamData, loadStreamDataFromFile, StreamDataFile, StreamDataChunk } from '@/lib/fileUtils'
import '../../styles/stream-controls.css'

interface StreamControlsProps {
  streamProcessor: any
  isProcessing: boolean
}

function StreamControls({ streamProcessor, isProcessing }: StreamControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [approvedChunks, setApprovedChunks] = useState(0);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [currentChunk, setCurrentChunk] = useState<string | null>(null);
  const [lastProcessedChunk, setLastProcessedChunk] = useState<string | null>(null);
  const [stateHtml, setStateHtml] = useState<string>('');
  
  // For save and load functionality
  const [savedStreams, setSavedStreams] = useState<StreamDataFile[]>([]);
  const [loadedStreamData, setLoadedStreamData] = useState<StreamDataFile | null>(null);
  const [isUsingLoadedStream, setIsUsingLoadedStream] = useState(false);
  const [currentLoadedChunkIndex, setCurrentLoadedChunkIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectedChunksRef = useRef<StreamDataChunk[]>([]);

  // Initialize manual mode and get existing chunks
  useEffect(() => {
    try {
      // Initialize manual mode
      const savedManualMode = localStorage.getItem('manualModeEnabled');
      if (savedManualMode === 'true') {
        setManualMode(true);
        
        if (typeof window !== 'undefined') {
          (window as any).__MANUAL_MODE = true;
        }
        
        if (streamProcessor && typeof streamProcessor.toggleManualMode === 'function') {
          streamProcessor.toggleManualMode(true);
        } else if (streamProcessor) {
          streamProcessor.manualMode = true;
        }
      }
      
      // Try to get any chunks that may already be in the streamProcessor
      if (streamProcessor) {
        // Try from processedChunks property
        if (streamProcessor.processedChunks && Array.isArray(streamProcessor.processedChunks)) {
          streamProcessor.processedChunks.forEach(chunk => {
            if (chunk) {
              collectedChunksRef.current.push({
                timestamp: new Date().toISOString(),
                content: chunk
              });
            }
          });
        }
        
        // Try from actionHandler's chunks
        if (streamProcessor.actionHandler && 
            streamProcessor.actionHandler.chunks && 
            Array.isArray(streamProcessor.actionHandler.chunks)) {
          
          streamProcessor.actionHandler.chunks.forEach(chunk => {
            if (chunk) {
              collectedChunksRef.current.push({
                timestamp: new Date().toISOString(),
                content: chunk
              });
            }
          });
        }
        
        // Try from stateMachine's chunks
        if (streamProcessor.stateMachine && 
            typeof streamProcessor.stateMachine.getAllChunks === 'function') {
          try {
            const stateChunks = streamProcessor.stateMachine.getAllChunks();
            if (Array.isArray(stateChunks)) {
              stateChunks.forEach(chunk => {
                if (chunk) {
                  collectedChunksRef.current.push({
                    timestamp: new Date().toISOString(),
                    content: chunk
                  });
                }
              });
            }
          } catch (e) {
            console.error('Error getting chunks from state machine:', e);
          }
        }
        
        // Remove duplicates
        const uniqueChunks: StreamDataChunk[] = [];
        const seen = new Set<string>();
        
        collectedChunksRef.current.forEach(chunk => {
          if (!seen.has(chunk.content)) {
            seen.add(chunk.content);
            uniqueChunks.push(chunk);
          }
        });
        
        collectedChunksRef.current = uniqueChunks;
      }
    } catch (e) {
      // Silent error handling
    }
  }, [streamProcessor]);

  // Poll for stream processor status
  useEffect(() => {
    if (!streamProcessor) return;

    const interval = setInterval(() => {
      try {
        if (typeof streamProcessor.getQueueStatus === 'function') {
          const status = streamProcessor.getQueueStatus() || {
            pendingChunks: 0,
            approvedChunks: 0,
            waitingApproval: false,
            manualMode: false
          };
          
          setPendingChunks(status.pendingChunks || 0);
          setApprovedChunks(status.approvedChunks || 0);
          setWaitingForApproval(status.waitingApproval || false);
          
          // If the reported pending chunks count is > 0, try to access the raw chunks
          if (status.pendingChunks > 0) {
            // Try different properties that might contain the pending chunks
            const possibleQueueProperties = ['_chunkQueue', 'chunkQueue', '_pendingChunks', 'pendingChunks', 'queue', '_queue', 'chunks', '_chunks'];
            
            for (const prop of possibleQueueProperties) {
              if (streamProcessor[prop] && Array.isArray(streamProcessor[prop])) {
                streamProcessor[prop].forEach((chunk: any) => {
                  if (chunk && typeof chunk === 'string') {
                    // Add to collection if not already present
                    const exists = collectedChunksRef.current.some(c => c.content === chunk);
                    if (!exists && !isUsingLoadedStream) {
                      collectedChunksRef.current.push({
                        timestamp: new Date().toISOString(),
                        content: chunk
                      });
                    }
                  }
                });
              }
            }
          }
          
          if (streamProcessor.getCurrentChunk && typeof streamProcessor.getCurrentChunk === 'function') {
            const chunk = streamProcessor.getCurrentChunk();
            if (chunk && chunk !== currentChunk) {
              setCurrentChunk(chunk);
              
              // Collect the chunk for saving later, but only if it's a new chunk
              if (!isUsingLoadedStream) {
                const exists = collectedChunksRef.current.some(c => c.content === chunk);
                if (!exists) {
                  collectedChunksRef.current.push({
                    timestamp: new Date().toISOString(),
                    content: chunk
                  });
                }
              }
            }
          }
          
          // Also collect any processed chunks from the streamProcessor if available
          if (!isUsingLoadedStream && 
              streamProcessor.processedChunks && 
              Array.isArray(streamProcessor.processedChunks)) {
            
            // Get current set of processed chunks in the ref
            const existingContents = new Set(
              collectedChunksRef.current.map(c => c.content)
            );
            
            // Add any new processed chunks
            streamProcessor.processedChunks.forEach(chunk => {
              // Only add if we don't already have this chunk
              if (chunk && !existingContents.has(chunk)) {
                collectedChunksRef.current.push({
                  timestamp: new Date().toISOString(),
                  content: chunk
                });
                existingContents.add(chunk);
              }
            });
          }
        }
      } catch (e) {
        // Silent error handling
      }
    }, 200);
    
    return () => clearInterval(interval);
  }, [streamProcessor, currentChunk, isUsingLoadedStream]);

  // Update state HTML when chunks are processed
  useEffect(() => {
    if (streamProcessor && typeof streamProcessor.getStateHtml === 'function') {
      try {
        const html = streamProcessor.getStateHtml();
        setStateHtml(html);
      } catch (e) {
        console.error("Error getting state HTML:", e);
      }
    }
  }, [streamProcessor, approvedChunks]);

  // Toggle manual mode
  const handleToggleManual = (checked: boolean) => {
    setManualMode(checked);
    
    if (typeof window !== 'undefined') {
      (window as any).__MANUAL_MODE = checked;
    }
    
    try {
      localStorage.setItem('manualModeEnabled', checked ? 'true' : 'false');
    } catch (e) {
      // Silent error handling
    }
    
    if (!streamProcessor) return;
    
    if (typeof streamProcessor.toggleManualMode === 'function') {
      streamProcessor.toggleManualMode(checked);
    } else {
      streamProcessor.manualMode = checked;
    }
  };

  // Save currently collected chunks as a stream
  const handleSaveStreamData = async () => {
    // Try to collect chunks from all possible sources before saving
    // This is nearly identical to the Debug button's comprehensive collection code
    if (streamProcessor) {
      
      // Try to capture chunks from queue
      if (streamProcessor.chunkQueue) {
        
        // Add chunks from queue to our collection
        if (Array.isArray(streamProcessor.chunkQueue)) {
          streamProcessor.chunkQueue.forEach(chunk => {
            if (chunk) {
              collectedChunksRef.current.push({
                timestamp: new Date().toISOString(),
                content: chunk
              });
            }
          });
        }
      }
      
      // Try to access pendingChunks
      if (streamProcessor.pendingChunks) {
        // Add them to collection
        if (Array.isArray(streamProcessor.pendingChunks)) {
          streamProcessor.pendingChunks.forEach(chunk => {
            if (chunk) {
              collectedChunksRef.current.push({
                timestamp: new Date().toISOString(),
                content: chunk
              });
            }
          });
        }
      }
      
      // Try to access chunks from _chunks if it exists
      if (streamProcessor._chunks) {
        
        // Add them to collection
        if (Array.isArray(streamProcessor._chunks)) {
          streamProcessor._chunks.forEach(chunk => {
            if (chunk) {
              collectedChunksRef.current.push({
                timestamp: new Date().toISOString(),
                content: chunk
              });
            }
          });
        }
      }
      
      // Try stateMachine
      if (streamProcessor.stateMachine) {
        
        // Try getAllChunks method
        try {
          if (typeof streamProcessor.stateMachine.getAllChunks === 'function') {
            const allChunks = streamProcessor.stateMachine.getAllChunks();
            
            if (Array.isArray(allChunks) && allChunks.length > 0) {
              allChunks.forEach(chunk => {
                if (chunk) {
                  collectedChunksRef.current.push({
                    timestamp: new Date().toISOString(),
                    content: chunk
                  });
                }
              });
            }
          }
        } catch (e) {
          console.error('Error getting chunks from state machine:', e);
        }
        
        // Try to access _chunks directly
        if (streamProcessor.stateMachine._chunks) {
          
          // Add to collection
          if (Array.isArray(streamProcessor.stateMachine._chunks)) {
            streamProcessor.stateMachine._chunks.forEach(chunk => {
              if (chunk) {
                collectedChunksRef.current.push({
                  timestamp: new Date().toISOString(),
                  content: chunk
                });
              }
            });
          }
        }
        
        // Try to access rawChunks
        if (streamProcessor.stateMachine.rawChunks) {
          
          // Add to collection
          if (Array.isArray(streamProcessor.stateMachine.rawChunks)) {
            streamProcessor.stateMachine.rawChunks.forEach(chunk => {
              if (chunk) {
                collectedChunksRef.current.push({
                  timestamp: new Date().toISOString(),
                  content: chunk
                });
              }
            });
          }
        }
      }
      
      // Try actionHandler
      if (streamProcessor.actionHandler) {
        
        // Check for chunks property
        if (streamProcessor.actionHandler.chunks) {
          
          if (Array.isArray(streamProcessor.actionHandler.chunks)) {
            streamProcessor.actionHandler.chunks.forEach(chunk => {
              if (chunk) {
                collectedChunksRef.current.push({
                  timestamp: new Date().toISOString(),
                  content: chunk
                });
              }
            });
          }
        }
        
        // Check for rawChunks
        if (streamProcessor.actionHandler.rawChunks) {
          
          if (Array.isArray(streamProcessor.actionHandler.rawChunks)) {
            streamProcessor.actionHandler.rawChunks.forEach(chunk => {
              if (chunk) {
                collectedChunksRef.current.push({
                  timestamp: new Date().toISOString(),
                  content: chunk
                });
              }
            });
          }
        }
      }
    }
    
    // Deduplicate chunks
    const uniqueChunks: StreamDataChunk[] = [];
    const seen = new Set<string>();
    
    collectedChunksRef.current.forEach(chunk => {
      if (!seen.has(chunk.content)) {
        seen.add(chunk.content);
        uniqueChunks.push(chunk);
      }
    });
    
    // Replace with deduplicated array
    collectedChunksRef.current = uniqueChunks;
    
    // Attempt direct access to chunkQueue as a last resort before giving up
    if (collectedChunksRef.current.length === 0 && streamProcessor && pendingChunks > 0) {
      
      // Create dummy chunks based on pending count
      for (let i = 0; i < pendingChunks; i++) {
        collectedChunksRef.current.push({
          timestamp: new Date().toISOString(),
          content: `Placeholder chunk ${i+1} of ${pendingChunks} (actual content not accessible)`
        });
      }
    }
    
    if (collectedChunksRef.current.length === 0) {
      alert('No stream data to save. Process some chunks first.');
      return;
    }
    
    
    // Prompt for a name
    const name = prompt('Enter a name for this stream data:', 
      `Stream Data ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
    
    if (!name) return; // User cancelled
    
    const description = prompt('Enter a description (optional):');
    
    // Create raw chunks array from collected chunks
    const rawChunks = collectedChunksRef.current.map(chunk => chunk.content);
    
    // Save the stream data
    const success = await saveStreamData(
      rawChunks, 
      collectedChunksRef.current, 
      name, 
      description || undefined
    );
    
    if (success) {
      alert('Stream data saved successfully');
    } else {
      alert('Failed to save stream data');
    }
  };
  
  // Handle loading stream data
  const handleLoadStreamData = () => {
    // Trigger the file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    try {
      const file = files[0];
      const streamData = await loadStreamDataFromFile(file);
      
      if (streamData) {
        // Force manual mode silently without side effects
        if (!manualMode) {
          if (streamProcessor) {
            streamProcessor.manualMode = true;
          }
          setManualMode(true);
          localStorage.setItem('manualModeEnabled', 'true');
          if (typeof window !== 'undefined') {
            (window as any).__MANUAL_MODE = true;
          }
        }
        
        // Extract chunks and prepare for display
        const chunks = streamData.chunks.map(chunk => chunk.content);
        if (chunks.length > 0) {
          // Set as loaded stream
          setLoadedStreamData(streamData);
          setIsUsingLoadedStream(true);
          setCurrentLoadedChunkIndex(0);
          
          // Display the first chunk
          setCurrentChunk(chunks[0]);
          setPendingChunks(chunks.length);
          setWaitingForApproval(true);
          
          // If stream processor has a queue, replace it
          if (streamProcessor && typeof streamProcessor.chunkQueue !== 'undefined') {
            streamProcessor.chunkQueue = [...chunks];
          }
        }
        
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // Show success message
        alert(`Loaded ${chunks.length} chunks. Ready to process.`);
      }
    } catch (error) {
      console.error('Failed to load stream data:', error);
      alert('Failed to load stream data file');
    }
  };
  
  // Clear loaded stream and return to normal mode
  const clearLoadedStream = () => {
    setLoadedStreamData(null);
    setIsUsingLoadedStream(false);
    setCurrentLoadedChunkIndex(0);
    setPendingChunks(0);
    setWaitingForApproval(false);
    setCurrentChunk(null);
    setLastProcessedChunk(null);
  };
  
  // Approve next chunk
  const handleApproveNext = () => {
    if (currentChunk) {
      setLastProcessedChunk(currentChunk);
      
      // Add to collected chunks for saving later
      collectedChunksRef.current.push({
        timestamp: new Date().toISOString(),
        content: currentChunk
      });
    }
    
    setApprovedChunks(prev => prev + 1);
    setWaitingForApproval(false);
    setCurrentChunk(null);
    
    if (!streamProcessor) return;
    
    if (typeof streamProcessor.approveNextChunk === 'function') {
      streamProcessor.approveNextChunk();
    }
    
    // If we're using a loaded stream, advance to the next chunk
    if (isUsingLoadedStream && loadedStreamData) {
      const nextIndex = currentLoadedChunkIndex + 1;
      
      if (nextIndex < loadedStreamData.chunks.length) {
        // Get the next chunk
        const nextChunk = loadedStreamData.chunks[nextIndex].content;
        
        // Display it after a short delay
        setTimeout(() => {
          setCurrentChunk(nextChunk);
          setWaitingForApproval(true);
          setPendingChunks(loadedStreamData.chunks.length - nextIndex);
        }, 500);
        
        // Update the index
        setCurrentLoadedChunkIndex(nextIndex);
      } else {
        // End of loaded stream
        setWaitingForApproval(false);
        setPendingChunks(0);
        setIsUsingLoadedStream(false);
        alert('All chunks from loaded stream have been processed!');
      }
    }
  };

  return (
    <div className="relative">
      {/* Header icon - only show the icon to match other header buttons */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-50 rounded-lg transition-colors relative"
        title="Stream Controls"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          className="h-5 w-5 text-gray-600"
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
        
        {/* Completely new manual mode indicator with unique styling */}
        <div 
          className="stream-controls-manual-indicator"
          style={{
            display: manualMode ? 'block' : 'none',
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#10B981', /* Green-500 */
            boxShadow: '0 0 0 1px white',
            animation: 'pulse 2s infinite'
          }}
        />
        
        {/* Badge for pending chunks - pushed to left side to avoid overlap */}
        {pendingChunks > 0 && (
          <span className="absolute top-0 left-0 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-blue-600 rounded-full transform -translate-x-1 -translate-y-1">
            {pendingChunks}
          </span>
        )}
      </button>
      
      {/* Dropdown panel */}
      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-2 bg-white p-4 rounded-lg shadow-lg z-[9999] border border-gray-200"
          style={{
            width: '350px',
            maxWidth: '350px',
            minWidth: '350px',
            marginTop: '0.5rem'
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-800 font-bold">Stream Controls</div>
            {!streamProcessor ? (
              <span className="inline-block px-2 py-1 rounded-full bg-red-100 text-xs text-red-700">Not Available</span>
            ) : isProcessing ? (
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            ) : manualMode ? (
              <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
            ) : (
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
            )}
          </div>
          
          {/* Save/Load buttons */}
          <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
            <div className="flex space-x-2">
              <button
                onClick={handleSaveStreamData}
                className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-white"
                title="Save the current stream for future use"
              >
                Save
              </button>
              
              <button
                onClick={handleLoadStreamData}
                className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 rounded text-white"
                title="Load a previously saved stream"
              >
                Load
              </button>
              

            </div>
            
            {loadedStreamData && (
              <div className="flex items-center">
                <span className="text-xs text-green-600 mr-2">
                  {currentLoadedChunkIndex}/{loadedStreamData.chunks.length}
                </span>
                <button
                  onClick={clearLoadedStream}
                  className="text-xs px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                  title="Clear loaded stream"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".json"
            className="hidden"
          />
          
          <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
            <div>
              <span className="text-xs mr-2 text-gray-700">Manual Mode</span>
              <div className="mt-1 text-[10px] text-gray-500">Set before chat begins</div>
            </div>
            <div className="flex items-center">
              <span className={`text-xs mr-2 ${manualMode ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                {manualMode ? 'ON' : 'OFF'}
              </span>
              <button 
                className={`rounded-full w-10 h-6 p-1 transition-colors ${manualMode ? 'bg-green-500' : 'bg-gray-300'}`}
                onClick={() => handleToggleManual(!manualMode)}
                disabled={!streamProcessor}
              >
                <div 
                  className={`bg-white rounded-full w-4 h-4 transform transition-transform ${manualMode ? 'translate-x-4' : ''}`} 
                />
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Pending:</span>
              <Badge variant="outline" className={`${pendingChunks > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                {streamProcessor ? pendingChunks : '?'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Processed:</span>
              <Badge variant="outline" className="bg-blue-100 text-blue-800">{streamProcessor ? approvedChunks : '?'}</Badge>
            </div>
          </div>
          
          <Button
            size="sm"
            variant="default"
            className="w-full font-medium"
            style={{
              backgroundColor: !streamProcessor 
                ? '#E5E7EB' // Gray-200
                : !manualMode
                  ? '#9CA3AF' // Gray-400 (dimmed to indicate disabled)
                  : pendingChunks === 0
                    ? '#D1D5DB' // Gray-300
                    : waitingForApproval 
                      ? '#10B981' // Green-500
                      : '#8B5CF6'  // Purple-500
            }}
            disabled={!streamProcessor || !manualMode || (manualMode && pendingChunks === 0)}
            onClick={handleApproveNext}
          >
            {!streamProcessor 
              ? 'Connect to Start' 
              : !manualMode
                ? 'Enable Manual Mode First'
                : pendingChunks === 0
                  ? 'All Chunks Processed ✓'
                  : 'Process Next Chunk ➡️'
            }
          </Button>
          
          {manualMode && (
            <div className="mt-2 px-2 py-1 rounded text-xs flex items-center justify-center"
                 style={{ 
                   background: 'rgba(16, 185, 129, 0.15)',
                   border: '1px solid #10B981',
                   color: '#065F46' 
                 }}>
              <div className="stream-controls-manual-indicator inline-block mr-2"
                   style={{
                     width: '6px',
                     height: '6px',
                     borderRadius: '50%',
                     background: '#10B981',
                     boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.5)'
                   }}></div>
              <span style={{ fontWeight: 'bold' }}>Manual Mode Active</span>
            </div>
          )}
          
          {waitingForApproval && (
            <div className="mt-2 text-xs text-amber-700 flex items-center">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse mr-2"></span>
              Waiting for approval...
            </div>
          )}
          
          {/* Chunk Preview Area */}
          {manualMode && (
            <div className="mt-3 border-t border-gray-200 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-700 font-semibold">Chunk Preview</span>
                {currentChunk ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 font-medium animate-pulse">Ready</Badge>
                ) : lastProcessedChunk ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-800">Last Processed</Badge>
                ) : (
                  <Badge variant="outline" className="bg-gray-100 text-gray-800">None</Badge>
                )}
              </div>
              
              <div 
                className={`bg-gray-50 rounded p-2 max-h-[120px] overflow-auto text-[10px] font-mono border ${
                  currentChunk 
                    ? 'border-green-400 animate-pulse' 
                    : 'border-gray-200'
                }`}
                style={{
                  width: '100%',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}
              >
                {currentChunk ? (
                  <div>
                    <div className="text-green-600 font-bold mb-1">NEXT CHUNK:</div>
                    <pre className="whitespace-pre-wrap break-all text-gray-700" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                      {currentChunk.slice(0, 500)}
                      {currentChunk.length > 500 && '...'}
                    </pre>
                  </div>
                ) : lastProcessedChunk ? (
                  <div>
                    <div className="text-amber-600 font-bold mb-1">LAST PROCESSED:</div>
                    <pre className="whitespace-pre-wrap break-all text-gray-500" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                      {lastProcessedChunk.slice(0, 500)}
                      {lastProcessedChunk.length > 500 && '...'}
                    </pre>
                  </div>
                ) : (
                  <div className="text-gray-400 italic text-center">
                    No chunk data available
                  </div>
                )}
              </div>
              
              {/* State Visualizer Component */}
              {stateHtml && (
                <div className="mt-3" style={{ width: '100%', maxWidth: '100%' }}>
                  <StateVisualizer 
                    html={stateHtml} 
                    isVisible={true}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Click outside handler */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default StreamControls;