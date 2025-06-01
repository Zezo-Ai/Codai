"""Logging system monitoring."""

import threading
import time
from datetime import datetime
from typing import Dict, Any
from collections import defaultdict
import statistics

class LogMonitor:
    """Monitor logging system performance and health."""
    
    def __init__(self, manager):
        """Initialize the monitor.
        
        Args:
            manager: LogManager instance
        """
        self.manager = manager
        self.running = False
        self.metrics = defaultdict(list)
        self.alert_thresholds = self.manager.config['logging']['monitoring']['alert_thresholds']
        self.monitor_thread = None
    
    def start(self) -> None:
        """Start the monitoring thread."""
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
    
    def stop(self) -> None:
        """Stop the monitoring thread."""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join()
    
    def _monitor_loop(self) -> None:
        """Main monitoring loop."""
        interval = self.manager.config['logging']['monitoring']['metrics_interval']
        
        while self.running:
            try:
                self._collect_metrics()
                self._check_alerts()
                time.sleep(interval)
            except Exception as e:
                print(f"Error in monitoring loop: {e}")
    
    def _collect_metrics(self) -> None:
        """Collect logging metrics."""
        metrics = {
            'timestamp': datetime.utcnow().isoformat(),
            'log_counts': self._get_log_counts(),
            'error_rates': self._get_error_rates(),
            'response_times': self._get_response_times(),
            'resource_usage': self._get_resource_usage()
        }
        
        for category, values in metrics.items():
            if isinstance(values, dict):
                for key, value in values.items():
                    self.metrics[f"{category}.{key}"].append(value)
    
    def _check_alerts(self) -> None:
        """Check metrics against alert thresholds."""
        if self.metrics['error_rates.overall']:
            error_rate = self.metrics['error_rates.overall'][-1]
            if error_rate > self.alert_thresholds['error_rate']:
                self._trigger_alert('error_rate', error_rate)
        
        if self.metrics['response_times.avg']:
            response_time = self.metrics['response_times.avg'][-1]
            if response_time > self.alert_thresholds['response_time']:
                self._trigger_alert('response_time', response_time)
    
    def _trigger_alert(self, alert_type: str, value: float) -> None:
        """Trigger an alert for a metric."""
        alert_logger = self.manager.get_logger('monitoring.alerts', 'monitoring')
        alert_logger.warning(
            f"Alert: {alert_type} threshold exceeded",
            extra={
                'alert_type': alert_type,
                'current_value': value,
                'threshold': self.alert_thresholds[alert_type]
            }
        )
    
    def _get_log_counts(self) -> Dict[str, int]:
        """Get log counts by category."""
        counts = defaultdict(int)
        for logger in self.manager.loggers.values():
            for handler in logger.handlers:
                if hasattr(handler, 'baseFilename'):
                    with open(handler.baseFilename) as f:
                        counts[logger.name] += sum(1 for _ in f)
        return dict(counts)
    
    def _get_error_rates(self) -> Dict[str, float]:
        """Calculate error rates."""
        error_counts = defaultdict(int)
        total_counts = defaultdict(int)
        
        for logger in self.manager.loggers.values():
            for handler in logger.handlers:
                if hasattr(handler, 'baseFilename'):
                    with open(handler.baseFilename) as f:
                        for line in f:
                            total_counts[logger.name] += 1
                            if '"level": "ERROR"' in line:
                                error_counts[logger.name] += 1
        
        rates = {}
        for name in total_counts:
            if total_counts[name] > 0:
                rates[name] = error_counts[name] / total_counts[name]
        
        if rates:
            rates['overall'] = sum(error_counts.values()) / sum(total_counts.values())
        
        return rates
    
    def _get_response_times(self) -> Dict[str, float]:
        """Calculate response time metrics."""
        times = []
        for logger in self.manager.loggers.values():
            if 'server.access' in logger.name:
                for handler in logger.handlers:
                    if hasattr(handler, 'baseFilename'):
                        with open(handler.baseFilename) as f:
                            for line in f:
                                if 'duration_ms' in line:
                                    try:
                                        duration = float(line.split('duration_ms": ')[1].split(',')[0])
                                        times.append(duration)
                                    except:
                                        continue
        
        if times:
            return {
                'avg': statistics.mean(times),
                'min': min(times),
                'max': max(times),
                'p95': statistics.quantiles(times, n=20)[18]  # 95th percentile
            }
        return {}
    
    def _get_resource_usage(self) -> Dict[str, Any]:
        """Get logging system resource usage."""
        import os
        import psutil
        
        process = psutil.Process(os.getpid())
        return {
            'cpu_percent': process.cpu_percent(),
            'memory_mb': process.memory_info().rss / 1024 / 1024,
            'open_files': len(process.open_files()),
            'threads': len(process.threads())
        }