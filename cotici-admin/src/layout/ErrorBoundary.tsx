import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Isole les erreurs de rendu pour ne pas perdre toute l'interface. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A brancher sur Sentry lors de la mise en production.
    console.error('Erreur de rendu du back-office', error, info.componentStack);
  }

  private handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-500" aria-hidden />
        <h2 className="mt-2 text-sm font-semibold text-red-900">Une erreur est survenue</h2>
        <p className="mt-1 text-xxs text-red-700">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={this.handleReset}>
            Reessayer
          </Button>
          <Button variant="danger" onClick={() => window.location.reload()}>
            Recharger la page
          </Button>
        </div>
      </div>
    );
  }
}
