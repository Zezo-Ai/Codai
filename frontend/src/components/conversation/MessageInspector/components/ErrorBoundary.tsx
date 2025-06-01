import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
    public state: State = {
        hasError: false
    };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('MessageInspector Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-4">
                    <div className="flex flex-col items-center space-y-4 max-w-md text-center">
                        <AlertTriangle className="h-12 w-12 text-red-500" />
                        <h2 className="text-xl font-semibold">Something went wrong</h2>
                        <p className="text-sm text-gray-500">
                            An error occurred while displaying the message inspector.
                        </p>
                        {this.state.error && (
                            <pre className="text-xs bg-gray-100 p-2 rounded w-full overflow-auto max-h-24">
                                {this.state.error.message}
                            </pre>
                        )}
                        <Button
                            onClick={() => {
                                this.setState({ hasError: false });
                                window.location.reload();
                            }}
                        >
                            Try Again
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}