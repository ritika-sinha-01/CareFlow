import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthContext";
import { authErrorMessage } from "@/lib/api";
import { DEMO_UI_ENABLED } from "@/lib/demo-mode";
import { homeForRole } from "@/lib/types";

const demos = [
  { role: "Patient", email: "aarav.gupta@careflow.demo" },
  { role: "Doctor", email: "ananya.sharma@careflow.demo" },
  { role: "Admin", email: "admin@careflow.demo" },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/") ? from : homeForRole(session.user.role), { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {DEMO_UI_ENABLED
              ? "Patients can register. Demo clinician and admin passwords are listed below."
              : "Patients create an account. Clinicians and administrators sign in with clinic-issued credentials."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            New patient?{" "}
            <Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
      {DEMO_UI_ENABLED ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo accounts</CardTitle>
          <CardDescription>Password for all demo users: CareFlow!demo1</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {demos.map((demo) => (
            <Button
              key={demo.email}
              variant="outline"
              className="w-full justify-between"
              onClick={() => {
                setEmail(demo.email);
                setPassword("CareFlow!demo1");
              }}
            >
              <span>{demo.role}</span>
              <span className="font-normal text-muted-foreground">{demo.email}</span>
            </Button>
          ))}
        </CardContent>
      </Card>
      ) : null}
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={user.role === "PATIENT" ? "/patient/doctors" : homeForRole(user.role)} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const session = await register({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        phone: String(form.get("phone") ?? "") || undefined,
      });
      navigate(session.user.role === "PATIENT" ? "/patient/doctors" : homeForRole(session.user.role), { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught, "Unable to create your account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>Create a patient account</CardTitle>
          <CardDescription>Doctor and admin accounts are issued by the clinic.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" name="firstName" autoComplete="given-name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" name="lastName" autoComplete="family-name" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" name="phone" type="tel" autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
              <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden bg-primary px-12 py-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-10 h-56 w-56 rounded-full bg-primary-foreground/10 blur-3xl" />
        <Link to="/">
          <BrandMark inverted />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold tracking-tight">A quieter way to run clinic time.</p>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/80">
            Holds expire. Double-booking is rejected by the database. Email, AI, and calendar stay optional —
            they never take the appointment down with them.
          </p>
        </div>
        {DEMO_UI_ENABLED ? (
          <p className="relative text-xs text-primary-foreground/60">Demo password for seeded accounts: CareFlow!demo1</p>
        ) : (
          <p className="relative text-xs text-primary-foreground/60">Clinic access is issued by your administrator.</p>
        )}
      </aside>
      <div className="flex min-h-screen flex-col justify-center px-4 py-10">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <Link to="/" className="self-start lg:hidden">
            <BrandMark />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
