import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiFetch } from '@/lib/api';

export default function EmergencyLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiFetch<{
        success: boolean;
        user: any;
        warning?: string;
      }>('/auth/emergency', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.success) {
        // Redirect to dashboard on successful login
        navigate('/incidents');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/20">
              <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-500" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Emergency Access</CardTitle>
          <CardDescription className="text-center">
            Break-glass authentication for emergency scenarios when Okta is unavailable
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              This is for emergency use only. All break-glass logins are logged and monitored.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@pagefree.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              For normal access, use{' '}
              <a
                href="/api/auth/login"
                className="text-primary hover:underline font-medium"
              >
                Okta authentication
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
