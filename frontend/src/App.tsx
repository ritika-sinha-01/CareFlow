import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/components/AppShell";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage, RegisterPage } from "@/pages/AuthPages";
import { PatientDashboardPage } from "@/pages/patient/DashboardPage";
import { PatientDoctorDetailPage, PatientDoctorsPage } from "@/pages/patient/DoctorsPage";
import { PatientBookPage } from "@/pages/patient/BookPage";
import { PatientAppointmentDetailPage, PatientAppointmentsPage, PatientMedicationsPage } from "@/pages/patient/AppointmentsPage";
import { PatientProfilePage } from "@/pages/patient/ProfilePage";
import {
  DoctorAppointmentDetailPage,
  DoctorAppointmentsPage,
  DoctorDashboardPage,
  DoctorPatientsPage,
  DoctorProfilePage,
} from "@/pages/doctor/DoctorPages";
import {
  AdminAppointmentDetailPage,
  AdminAppointmentsPage,
  AdminDashboardPage,
  AdminDoctorDetailPage,
  AdminDoctorNewPage,
  AdminDoctorsPage,
  AdminLeavePage,
  AdminNotificationsPage,
} from "@/pages/admin/AdminPages";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute roles={["PATIENT"]} />}>
            <Route path="/patient/dashboard" element={<PatientDashboardPage />} />
            <Route path="/patient/doctors" element={<PatientDoctorsPage />} />
            <Route path="/patient/doctors/:id" element={<PatientDoctorDetailPage />} />
            <Route path="/patient/book" element={<PatientBookPage />} />
            <Route path="/patient/appointments" element={<PatientAppointmentsPage />} />
            <Route path="/patient/appointments/:id" element={<PatientAppointmentDetailPage />} />
            <Route path="/patient/medications" element={<PatientMedicationsPage />} />
            <Route path="/patient/profile" element={<PatientProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={["DOCTOR"]} />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
            <Route path="/doctor/appointments" element={<DoctorAppointmentsPage />} />
            <Route path="/doctor/appointments/:id" element={<DoctorAppointmentDetailPage />} />
            <Route path="/doctor/patients" element={<DoctorPatientsPage />} />
            <Route path="/doctor/profile" element={<DoctorProfilePage />} />
          </Route>

          <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/doctors" element={<AdminDoctorsPage />} />
            <Route path="/admin/doctors/new" element={<AdminDoctorNewPage />} />
            <Route path="/admin/doctors/:id" element={<AdminDoctorDetailPage />} />
            <Route path="/admin/appointments" element={<AdminAppointmentsPage />} />
            <Route path="/admin/appointments/:id" element={<AdminAppointmentDetailPage />} />
            <Route path="/admin/leave" element={<AdminLeavePage />} />
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
