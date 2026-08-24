import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../src/components/AppShell";
import { SlotGrid } from "../src/components/SlotGrid";
import { EmptyState, QueryError } from "../src/components/Page";
import { PatientBookPage } from "../src/pages/patient/BookPage";
import { PatientDoctorsPage } from "../src/pages/patient/DoctorsPage";
import { ApiRequestError } from "../src/lib/api";
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

const apiRequest = vi.fn();
const apiGet = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
    apiGet: (...args: unknown[]) => apiGet(...args),
  };
});

const patient: PublicUser = {
  id: "p1",
  email: "aarav.gupta@careflow.demo",
  role: "PATIENT",
  firstName: "Aarav",
  lastName: "Gupta",
  phone: null,
  dateOfBirth: null,
  isDemo: true,
};

const doctorUser: PublicUser = { ...patient, id: "d1", role: "DOCTOR", firstName: "Ananya", lastName: "Sharma" };

function renderProtected(role: PublicUser["role"] | null, path = "/patient/dashboard") {
  authState.user = role === "PATIENT" ? patient : role === "DOCTOR" ? doctorUser : null;
  authState.loading = false;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Sign in</div>} />
        <Route path="/doctor/dashboard" element={<div>Doctor home</div>} />
        <Route element={<ProtectedRoute roles={["PATIENT"]} />}>
          <Route path="/patient/dashboard" element={<div>Patient home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("protected routes", () => {
  afterEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it("sends anonymous users to login", () => {
    renderProtected(null);
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("redirects a doctor away from the patient portal", () => {
    renderProtected("DOCTOR");
    expect(screen.getByText("Doctor home")).toBeInTheDocument();
  });

  it("renders the patient portal for a patient", () => {
    renderProtected("PATIENT");
    expect(screen.getByText("Patient home")).toBeInTheDocument();
  });
});

describe("patient doctor directory", () => {
  afterEach(() => {
    authState.user = null;
    apiGet.mockReset();
  });

  it("renders all six demo doctors returned by the patient directory", async () => {
    authState.user = patient;
    authState.loading = false;
    apiGet.mockImplementation(async (path: string) => {
      if (path !== "/api/patient/doctors") return [];
      return [
        { id: "1", name: "Ananya Sharma", specialization: "Cardiology", bio: null, slotDurationMin: 30, yearsExperience: 12, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
        { id: "2", name: "Rohan Mehta", specialization: "Dermatology", bio: null, slotDurationMin: 20, yearsExperience: 8, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
        { id: "3", name: "Priya Nair", specialization: "General Practice", bio: null, slotDurationMin: 30, yearsExperience: 10, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
        { id: "4", name: "Vikram Joshi", specialization: "Pediatrics", bio: null, slotDurationMin: 30, yearsExperience: 9, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
        { id: "5", name: "Sara Khan", specialization: "Orthopedics", bio: null, slotDurationMin: 30, yearsExperience: 11, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
        { id: "6", name: "Dev Patel", specialization: "Neurology", bio: null, slotDurationMin: 30, yearsExperience: 14, isDemo: true, workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] },
      ];
    });

    render(
      <MemoryRouter>
        <PatientDoctorsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Ananya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Rohan Mehta")).toBeInTheDocument();
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getByText("Vikram Joshi")).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.getByText("Dev Patel")).toBeInTheDocument();
    expect(screen.getAllByText(/Cardiology/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Neurology/).length).toBeGreaterThan(0);
  });
});

describe("empty and failure states", () => {
  it("shows empty and error copy", () => {
    render(
      <MemoryRouter>
        <EmptyState title="No clinicians listed" description="Ask an administrator to add doctor profiles." />
        <QueryError message="This appointment slot is no longer available." />
        <SlotGrid slots={[]} closed={false} onLeave={false} onSelect={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No clinicians listed")).toBeInTheDocument();
    expect(screen.getByText("This appointment slot is no longer available.")).toBeInTheDocument();
    expect(screen.getByText("No visit times on this date.")).toBeInTheDocument();
  });

  it("shows leave and closed slot states", () => {
    const { rerender } = render(
      <MemoryRouter>
        <SlotGrid slots={[]} closed={false} onLeave onSelect={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Doctor unavailable on this date.")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <SlotGrid slots={[]} closed onLeave={false} onSelect={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("The clinic is closed on this date. Choose a weekday.")).toBeInTheDocument();
  });
});

describe("booking page", () => {
  beforeEach(() => {
    authState.user = patient;
    authState.loading = false;
    apiRequest.mockReset();
    apiGet.mockReset();
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/api/patient/doctors") {
        return [
          {
            id: "doc-1",
            name: "Dr Ananya Sharma",
            specialization: "Cardiology",
            bio: null,
            slotDurationMin: 30,
            yearsExperience: 12,
            isDemo: true,
            workingHours: [],
            nextAvailableAt: "2026-08-24T04:30:00.000Z",
          },
        ];
      }
      if (path.includes("/slots")) {
        return {
          date: "2026-08-24",
          clinicTimezone: "Asia/Kolkata",
          slotDurationMin: 30,
          holdMinutes: 5,
          closed: false,
          onLeave: false,
          slots: [
            {
              startAt: "2026-08-24T04:30:00.000Z",
              endAt: "2026-08-24T05:00:00.000Z",
              label: "10:00 am",
              state: "AVAILABLE",
              holdExpiresAt: null,
              remainingSeconds: null,
            },
          ],
        };
      }
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it("counts down from the server holdExpiresAt and confirms the visit", async () => {
    const user = userEvent.setup();
    const holdExpiresAt = new Date(Date.now() + 90_000).toISOString();
    apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/api/patient/holds") {
        return {
          id: "hold-1",
          status: "HELD",
          startAt: "2026-08-24T04:30:00.000Z",
          endAt: "2026-08-24T05:00:00.000Z",
          holdExpiresAt,
          calendarSyncStatus: "NOT_CONNECTED",
          doctor: { id: "doc-1", name: "Dr Ananya Sharma", specialization: "Cardiology", isDemo: true },
          patient: { id: "p1", name: "Aarav Gupta" },
        };
      }
      if (path.includes("/confirm")) {
        return {
          id: "hold-1",
          status: "BOOKED",
          startAt: "2026-08-24T04:30:00.000Z",
          endAt: "2026-08-24T05:00:00.000Z",
          holdExpiresAt: null,
          calendarSyncStatus: "PENDING",
          doctor: { id: "doc-1", name: "Dr Ananya Sharma", specialization: "Cardiology", isDemo: true },
          patient: { id: "p1", name: "Aarav Gupta" },
        };
      }
      throw new Error(`unexpected ${options?.method} ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/patient/book"]}>
        <Routes>
          <Route path="/patient/book" element={<PatientBookPage />} />
          <Route path="/patient/appointments/:id" element={<div>Confirmed visit</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByText("Dr Ananya Sharma"));
    await user.click(await screen.findByText("10:00 am"));
    expect(await screen.findByTestId("hold-countdown")).toHaveTextContent(/Remaining 1:/);
    await user.type(screen.getByLabelText("Symptoms"), "Chest tightness after climbing stairs.");
    await user.click(screen.getByRole("button", { name: "Continue to review" }));
    await user.click(screen.getByRole("button", { name: "Confirm appointment" }));
    await waitFor(() => expect(screen.getByText("Confirmed visit")).toBeInTheDocument());
  });

  it("shows SLOT_UNAVAILABLE copy when the hold is rejected", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValue(
      new ApiRequestError("SLOT_UNAVAILABLE", "This appointment slot is no longer available.", 409),
    );
    render(
      <MemoryRouter initialEntries={["/patient/book"]}>
        <Routes>
          <Route path="/patient/book" element={<PatientBookPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByText("Dr Ananya Sharma"));
    await user.click(await screen.findByText("10:00 am"));
    expect(await screen.findByTestId("booking-error")).toHaveTextContent(
      "This appointment slot is no longer available.",
    );
  });

  it("shows expired-hold copy when the server hold has already lapsed", async () => {
    authState.user = patient;
    apiRequest.mockResolvedValue({
      id: "hold-1",
      status: "HELD",
      startAt: "2026-08-24T04:30:00.000Z",
      endAt: "2026-08-24T05:00:00.000Z",
      holdExpiresAt: new Date(Date.now() - 1000).toISOString(),
      calendarSyncStatus: "NOT_CONNECTED",
      doctor: { id: "doc-1", name: "Dr Ananya Sharma", specialization: "Cardiology", isDemo: true },
      patient: { id: "p1", name: "Aarav Gupta" },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/patient/book"]}>
        <Routes>
          <Route path="/patient/book" element={<PatientBookPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByText("Dr Ananya Sharma"));
    await user.click(await screen.findByText("10:00 am"));
    expect(await screen.findByTestId("booking-error")).toHaveTextContent("Your reservation expired");
  });
});
