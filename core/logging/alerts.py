"""Logging system alerts and notifications."""

from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path
import logging
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
from dataclasses import dataclass

@dataclass
class AlertThresholds:
    """Alert threshold configuration."""
    error_rate: float = 0.1  # 10%
    disk_usage: float = 0.9  # 90%
    response_time: float = 5000  # 5 seconds
    log_size: int = 1073741824  # 1GB
    archive_age: int = 90  # days

@dataclass
class AlertConfig:
    """Alert configuration."""
    email_config: Optional[Dict[str, str]] = None
    slack_webhook: Optional[str] = None
    teams_webhook: Optional[str] = None
    notification_interval: int = 3600  # 1 hour in seconds

class AlertManager:
    """Manage logging system alerts."""
    
    def __init__(self, log_dir: Path, thresholds: AlertThresholds = None, 
                 config: AlertConfig = None):
        """Initialize alert manager.
        
        Args:
            log_dir: Base logging directory
            thresholds: Alert thresholds configuration
            config: Alert notification configuration
        """
        self.log_dir = log_dir
        self.thresholds = thresholds or AlertThresholds()
        self.config = config or AlertConfig()
        self.logger = logging.getLogger(__name__)
        self.last_notification = {}
    
    def check_system_health(self) -> Dict[str, Any]:
        """Check logging system health.
        
        Returns:
            Dictionary containing health check results
        """
        health_status = {
            'status': 'healthy',
            'checks': {},
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            # Check disk usage
            disk_usage = self._check_disk_usage()
            health_status['checks']['disk_usage'] = {
                'status': 'ok' if disk_usage < self.thresholds.disk_usage else 'warning',
                'value': disk_usage,
                'threshold': self.thresholds.disk_usage
            }
            
            # Check log write permissions
            write_check = self._check_write_permissions()
            health_status['checks']['write_permissions'] = {
                'status': 'ok' if write_check else 'error',
                'value': write_check
            }
            
            # Check log rotation
            rotation_check = self._check_log_rotation()
            health_status['checks']['log_rotation'] = {
                'status': 'ok' if rotation_check else 'warning',
                'details': rotation_check
            }
            
            # Check archive health
            archive_check = self._check_archives()
            health_status['checks']['archives'] = {
                'status': 'ok' if archive_check['status'] else 'warning',
                'details': archive_check
            }
            
            # Update overall status
            if any(check['status'] == 'error' for check in health_status['checks'].values()):
                health_status['status'] = 'error'
            elif any(check['status'] == 'warning' for check in health_status['checks'].values()):
                health_status['status'] = 'warning'
        
        except Exception as e:
            self.logger.error(f"Error checking system health: {e}")
            health_status['status'] = 'error'
            health_status['error'] = str(e)
        
        return health_status
    
    def _check_disk_usage(self) -> float:
        """Check disk usage of log directory.
        
        Returns:
            Disk usage as a percentage
        """
        try:
            total_size = sum(f.stat().st_size for f in self.log_dir.rglob('*') if f.is_file())
            free_space = self.log_dir.stat().st_size
            return total_size / free_space
        except Exception as e:
            self.logger.error(f"Error checking disk usage: {e}")
            return 1.0
    
    def _check_write_permissions(self) -> bool:
        """Check if log directory is writable.
        
        Returns:
            True if writable, False otherwise
        """
        try:
            test_file = self.log_dir / '.write_test'
            test_file.touch()
            test_file.unlink()
            return True
        except Exception:
            return False
    
    def _check_log_rotation(self) -> Dict[str, Any]:
        """Check log rotation status.
        
        Returns:
            Dictionary containing rotation check results
        """
        results = {
            'oversize_logs': [],
            'rotation_needed': False
        }
        
        try:
            for log_file in self.log_dir.rglob('*.log'):
                size = log_file.stat().st_size
                if size > self.thresholds.log_size:
                    results['oversize_logs'].append({
                        'file': str(log_file),
                        'size': size
                    })
                    results['rotation_needed'] = True
        except Exception as e:
            self.logger.error(f"Error checking log rotation: {e}")
            results['error'] = str(e)
        
        return results
    
    def _check_archives(self) -> Dict[str, Any]:
        """Check archive system health.
        
        Returns:
            Dictionary containing archive check results
        """
        results = {
            'status': True,
            'old_archives': [],
            'corrupted_archives': []
        }
        
        try:
            cutoff = datetime.now() - timedelta(days=self.thresholds.archive_age)
            
            for archive in self.log_dir.parent.rglob('*.gz'):
                # Check age
                if archive.stat().st_mtime < cutoff.timestamp():
                    results['old_archives'].append(str(archive))
                
                # Check integrity
                try:
                    with gzip.open(archive, 'rb') as f:
                        f.read(1024)  # Try reading first 1KB
                except Exception:
                    results['corrupted_archives'].append(str(archive))
            
            if results['old_archives'] or results['corrupted_archives']:
                results['status'] = False
        
        except Exception as e:
            self.logger.error(f"Error checking archives: {e}")
            results['status'] = False
            results['error'] = str(e)
        
        return results
    
    def send_alert(self, alert_type: str, message: str, severity: str = 'warning',
                   details: Optional[Dict[str, Any]] = None) -> None:
        """Send alert notification.
        
        Args:
            alert_type: Type of alert
            message: Alert message
            severity: Alert severity (info, warning, error)
            details: Additional alert details
        """
        # Check notification throttling
        alert_key = f"{alert_type}:{severity}"
        last_sent = self.last_notification.get(alert_key, 0)
        if (datetime.now().timestamp() - last_sent) < self.config.notification_interval:
            return
        
        alert_data = {
            'type': alert_type,
            'message': message,
            'severity': severity,
            'timestamp': datetime.now().isoformat(),
            'details': details or {}
        }
        
        try:
            # Send email alert
            if self.config.email_config:
                self._send_email_alert(alert_data)
            
            # Send Slack alert
            if self.config.slack_webhook:
                self._send_slack_alert(alert_data)
            
            # Send Teams alert
            if self.config.teams_webhook:
                self._send_teams_alert(alert_data)
            
            # Update last notification time
            self.last_notification[alert_key] = datetime.now().timestamp()
        
        except Exception as e:
            self.logger.error(f"Error sending alert: {e}")
    
    def _send_email_alert(self, alert_data: Dict[str, Any]) -> None:
        """Send email alert.
        
        Args:
            alert_data: Alert information
        """
        try:
            msg = MIMEMultipart()
            msg['From'] = self.config.email_config['from']
            msg['To'] = self.config.email_config['to']
            msg['Subject'] = f"Logging System Alert: {alert_data['type']}"
            
            body = f"""
            Alert Type: {alert_data['type']}
            Severity: {alert_data['severity']}
            Time: {alert_data['timestamp']}
            
            Message:
            {alert_data['message']}
            
            Details:
            {json.dumps(alert_data['details'], indent=2)}
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP(self.config.email_config['smtp_server']) as server:
                if self.config.email_config.get('use_tls'):
                    server.starttls()
                if 'username' in self.config.email_config:
                    server.login(
                        self.config.email_config['username'],
                        self.config.email_config['password']
                    )
                server.send_message(msg)
        
        except Exception as e:
            self.logger.error(f"Error sending email alert: {e}")
    
    def _send_slack_alert(self, alert_data: Dict[str, Any]) -> None:
        """Send Slack alert.
        
        Args:
            alert_data: Alert information
        """
        try:
            color = {
                'info': '#36a64f',
                'warning': '#ffcc00',
                'error': '#ff0000'
            }.get(alert_data['severity'], '#cccccc')
            
            payload = {
                'attachments': [{
                    'color': color,
                    'title': f"Logging System Alert: {alert_data['type']}",
                    'text': alert_data['message'],
                    'fields': [
                        {
                            'title': 'Severity',
                            'value': alert_data['severity'],
                            'short': True
                        },
                        {
                            'title': 'Time',
                            'value': alert_data['timestamp'],
                            'short': True
                        }
                    ],
                    'footer': 'Logging System Monitor'
                }]
            }
            
            response = requests.post(
                self.config.slack_webhook,
                json=payload,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
        
        except Exception as e:
            self.logger.error(f"Error sending Slack alert: {e}")
    
    def _send_teams_alert(self, alert_data: Dict[str, Any]) -> None:
        """Send Microsoft Teams alert.
        
        Args:
            alert_data: Alert information
        """
        try:
            payload = {
                '@type': 'MessageCard',
                '@context': 'http://schema.org/extensions',
                'themeColor': {
                    'info': '0076D7',
                    'warning': 'FFA500',
                    'error': 'FF0000'
                }.get(alert_data['severity'], '0076D7'),
                'summary': f"Logging System Alert: {alert_data['type']}",
                'sections': [{
                    'activityTitle': f"Logging System Alert: {alert_data['type']}",
                    'activitySubtitle': alert_data['timestamp'],
                    'facts': [
                        {
                            'name': 'Severity',
                            'value': alert_data['severity']
                        },
                        {
                            'name': 'Message',
                            'value': alert_data['message']
                        }
                    ],
                    'text': json.dumps(alert_data['details'], indent=2)
                }]
            }
            
            response = requests.post(
                self.config.teams_webhook,
                json=payload,
                headers={'Content-Type': 'application/json'}
            )
            response.raise_for_status()
        
        except Exception as e:
            self.logger.error(f"Error sending Teams alert: {e}")