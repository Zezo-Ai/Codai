'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeAgo } from '@/lib/formatters';
import '@/components/analytics/TokenMetrics/components/styles.css';

type HistoryPoint = {
  timestamp: number;
  total: number;
  input: number;
  output: number;
}

type UsageChartProps = {
  history: HistoryPoint[];
}

const UsageChart: React.FC<UsageChartProps> = ({ history }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipData, setTooltipData] = useState<{ point: HistoryPoint, position: { x: number, y: number } } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [showRightScroll, setShowRightScroll] = useState(true);
  
  const maxTokens = Math.max(...history.map(p => p.total));

  // Handle scroll position updates
  const handleScroll = (e: Event) => {
    const container = e.target as HTMLDivElement;
    setShowRightScroll(
      Math.ceil(container.scrollLeft) < (container.scrollWidth - container.clientWidth - 2)
    );
  };

  // Initialize scroll position tracking
  useEffect(() => {
    const container = chartRef.current?.querySelector('.chart-scroll-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Handle tooltip visibility on scroll
  useEffect(() => {
    if (tooltipData) {
      const handleGlobalScroll = () => setTooltipData(null);
      window.addEventListener('scroll', handleGlobalScroll, true);
      return () => window.removeEventListener('scroll', handleGlobalScroll, true);
    }
  }, [tooltipData]);

  return (
    <>
      <div className="token-metrics">
        <div className="token-metrics-content">
          <div className="chart-header">
            <span className="chart-title">Usage Trends</span>
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-dot legend-dot-input" />
                <span className="legend-label">Input</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot legend-dot-output" />
                <span className="legend-label">Output</span>
              </div>
            </div>
          </div>

          <div ref={chartRef} className="chart-wrapper">
            <div 
              className="scroll-shadow scroll-shadow-left scroll-shadow-hidden"
            />
            <div 
              className={`scroll-shadow scroll-shadow-right ${showRightScroll ? 'scroll-shadow-visible' : 'scroll-shadow-hidden'}`}
            />

            <div className="chart-layout">
              <div className="y-axis">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="y-axis-label">
                    {Math.round((maxTokens * (4 - i)) / 4)}
                  </span>
                ))}
              </div>

              <div className="chart-area">
                <div className="chart-scroll-container">
                  <div className="grid-lines">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="grid-line" />
                    ))}
                  </div>

                  <div className="bars-container">
                    <div className="bars-wrapper">
                      {[...history].reverse().map((point, index) => {
                        const inputPercentage = ((point.input / maxTokens) * 100).toFixed(4);
                        const outputPercentage = ((point.output / maxTokens) * 100).toFixed(4);
                        
                        return (
                          <div 
                            key={point.timestamp}
                            className={`bar-item ${hoveredIndex === index ? 'bar-item-hovered' : ''}`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltipData({
                                point,
                                position: {
                                  x: rect.left + (rect.width / 2),
                                  y: rect.top - 10
                                }
                              });
                              setHoveredIndex(index);
                            }}
                            onMouseLeave={() => {
                              setTooltipData(null);
                              setHoveredIndex(null);
                            }}
                          >
                            <div className="bar-columns">
                              <div 
                                className="bar-column bar-column-output"
                                style={{ '--bar-height': `${outputPercentage}%` } as React.CSSProperties}
                              />
                              <div 
                                className="bar-column bar-column-input"
                                style={{ '--bar-height': `${inputPercentage}%` } as React.CSSProperties}
                              />
                            </div>
                            <span className="bar-label">
                              {formatTimeAgo(point.timestamp)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {tooltipData && typeof window !== 'undefined' && createPortal(
        <div 
          className="tooltip-portal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            transform: `translate(${tooltipData.position.x}px, ${tooltipData.position.y}px)`,
            zIndex: 9999,
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-title">{formatTimeAgo(tooltipData.point.timestamp)}</div>
            <div className="tooltip-metrics">
              <div className="tooltip-metric">
                <div className="legend-dot legend-dot-input" />
                <span>Input: {tooltipData.point.input}</span>
              </div>
              <div className="tooltip-metric">
                <div className="legend-dot legend-dot-output" />
                <span>Output: {tooltipData.point.output}</span>
              </div>
            </div>
            <div className="tooltip-total">Total: {tooltipData.point.total} tokens</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export { UsageChart };