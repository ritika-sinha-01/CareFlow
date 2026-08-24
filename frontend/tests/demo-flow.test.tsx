import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LandingPage } from "../src/pages/LandingPage";
import { PatientAppointmentDetailPage } from "../src/pages/patient/AppointmentsPage";
import { DoctorProfilePage } from "../src/pages/doctor/DoctorPages";
import type { PublicUser } from "../src/lib/types";

const authState: { user: PublicUser | null; loading: boolean } = {
  user: null,
  loading: false,
};

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    token: authState.user ? "token" : null,
    user: authState.user,
    doctor: null,
    loading: authState.loading,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
  useRole: () => authState.user?.role ?? null,
}));

const apiGet = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>("../src/lib/api");
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args),
  };
});

const patient: PublicUser = {
  id: "p1",
  email: "evaluator@example.com",
  role: "PATIENT",
  firstName: "Eva",
  lastName: "Luator",
  phone: null,
  dateOfBirth: null,
  isDemo: false,
};

describe("evaluator demo surfaces", () => {
  afterEach(() => {
    apiGet.mockReset();
    authState.user = null;
  });

  it("loads live doctors and optional-service health instead of a mock slot grid", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/health") {
        return {
          status: "DEGRADED",
          checkedAt: new Date().toISOString(),
          clinicTimezone: "Asia/Kolkata",
          components: [
            { name: "DATABASE", status: "OPERATIONAL", detail: "Connected" },
            { name: "APPOINTMENT_ENGINE", status: "OPERATIONAL", detail: "Slot uniqueness constraint is in place" },
            { name: "AI_SERVICE", status: "UNAVAILABLE", detail: "OpenAI is not configured", optional: true },
            { name: "EMAIL_SERVICE", status: "UNAVAILABLE", detail: "Email is not configured", optional: true },
            { name: "GOOGLE_CALENDAR", status: "UNAVAILABLE", detail: "Google Calendar is not configured", optional: true },
          ],
        };
      }
      if (path === "/api/doctors") {
        return [
          {
            id: "doc-1",
            name: "Ananya Sharma",
            specialization: "Cardiology",
            bio: null,
            slotDurationMin: 30,
            yearsExperience: 12,
            isDemo: true,
            workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
          },
        ];
      }
      throw new Error(`unexpected GET ${path}`);
    });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Ananya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Cardiology · Demo profile · Weekdays 09:00–17:00")).toBeInTheDocument();
    expect(screen.getByText("AI briefing (optional)")).toBeInTheDocument();
    expect(screen.getAllByText(/Optional\. Appointments still book/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Tuesday · Cardiology")).not.toBeInTheDocument();
  });

  it("shows booking confirmation and a graceful AI fallback from the appointment API", async () => {
    authState.user = patient;
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/patient/appointments/apt-1") {
        return {
          id: "apt-1",
          status: "BOOKED",
          startAt: "2026-08-24T04:30:00.000Z",
          endAt: "2026-08-24T05:00:00.000Z",
          holdExpiresAt: null,
          calendarSyncStatus: "NOT_CONNECTED",
          calendarParticipants: [
            { role: "DOCTOR", name: "Ananya Sharma", status: "NOT_CONNECTED", error: null },
            { role: "PATIENT", name: "Eva Luator", status: "NOT_CONNECTED", error: null },
          ],
          notifications: [{ id: "n1", type: "BOOKING_CONFIRMATION", status: "QUEUED" }],
          symptoms: "Chest tightness after climbing stairs.",
          doctor: { id: "doc-1", name: "Ananya Sharma", specialization: "Cardiology", isDemo: true },
          patient: { id: "p1", name: "Eva Luator" },
          ai: {
            status: "FAILED",
            error: "Visit briefing is unavailable. Original symptoms were preserved.",
            disclaimer: "AI-generated visit briefing. Not a medical diagnosis.",
          },
          postVisit: { status: "IDLE", error: null, disclaimer: "Patient summary is AI-assisted. It is not a diagnosis." },
          timeline: [],
          prescriptions: [],
        };
      }
      throw new Error(`unexpected GET ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/patient/appointments/apt-1"]}>
        <Routes>
          <Route path="/patient/appointments/:id" element={<PatientAppointmentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Appointment confirmed")).toBeInTheDocument();
    expect(screen.getByText("Visit briefing is unavailable. Original symptoms were preserved.")).toBeInTheDocument();
    expect(screen.getByText(/OpenAI is optional/)).toBeInTheDocument();
    expect(screen.getByText("Booking confirmation email")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("shows doctor leave controls from the live leave API", async () => {
    authState.user = {
      ...patient,
      id: "d1",
      role: "DOCTOR",
      firstName: "Ananya",
      lastName: "Sharma",
      email: "ananya.sharma@careflow.demo",
    };
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/doctor/profile") {
        return {
          user: authState.user,
          doctor: {
            specialization: "Cardiology",
            bio: null,
            slotDurationMin: 30,
            isDemo: true,
            calendarConnected: false,
            workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
          },
        };
      }
      if (path === "/api/doctor/leave") return [];
      if (path === "/api/doctor/calendar/status") {
        return { configured: false, connected: false, status: "UNAVAILABLE" };
      }
      throw new Error(`unexpected GET ${path}`);
    });

    render(
      <MemoryRouter>
        <DoctorProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Save leave" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByText(/does not silently delete visits/i)).toBeInTheDocument();
  });
});
