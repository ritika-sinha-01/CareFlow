import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { homeForRole, canAccessRoute, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const nav: Record<UserRole, Array<{ to: string; label: string; icon: typeof LayoutDashboard }>> = {
  PATIENT: [
    { to: "/patient/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/patient/book", label: "Book", icon: CalendarPlus },
    { to: "/patient/doctors", label: "Find care", icon: Stethoscope },
    { to: "/patient/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/patient/medications", label: "Medications", icon: Bell },
    { to: "/patient/profile", label: "Profile", icon: UserRound },
  ],
  DOCTOR: [
    { to: "/doctor/dashboard", label: "Today", icon: LayoutDashboard },
    { to: "/doctor/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/doctor/patients", label: "Patients", icon: Users },
    { to: "/doctor/profile", label: "Profile", icon: UserRound },
  ],
  ADMIN: [
    { to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/doctors", label: "Doctors", icon: Stethoscope },
    { to: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/admin/leave", label: "Leave", icon: Users },
    { to: "/admin/notifications", label: "Notifications", icon: Bell },
  ],
};

export function ProtectedRoute({ roles }: { roles: UserRole[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!canAccessRoute(user.role, roles)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return <AppShell />;
}

function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const items = nav[user.role];
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside
        className={cn(
          "border-b border-border/80 bg-card/80 backdrop-blur-sm md:border-b-0 md:border-r",
          "md:flex md:min-h-screen md:flex-col",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <Link to={homeForRole(user.role)}>
            <BrandMark />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="portal-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="sr-only">Menu</span>
          </Button>
        </div>
        <nav
          id="portal-nav"
          className={cn("flex-1 px-3 pb-4", open ? "block" : "hidden md:block")}
          aria-label="Portal"
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn("mt-auto border-t border-border/80 px-4 py-4", open ? "block" : "hidden md:block")}>
          <div className="flex items-center gap-3">
            <Avatar name={fullName} className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          {user.isDemo ? <p className="mt-2 text-xs text-muted-foreground">Demo account</p> : null}
          <Button variant="ghost" size="sm" className="mt-3 w-full justify-start px-0" onClick={logout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="min-w-0">
        <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
