import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { activeOccupancyKey } from "../src/utils/occupancy-key.ts";
import { addCalendarDays, clinicLocalToUtc, toClinicDateInput } from "../src/utils/clinic-time.ts";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "CareFlow!demo1";

function weekdayHours(doctorId: string) {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    doctorId,
    weekday,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "admin@careflow.demo" },
  });
  if (existing) {
    console.log("Demo data already present. Skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const todayStr = toClinicDateInput(new Date());
  const tomorrowStr = addCalendarDays(todayStr, 1);
  const yesterdayStr = addCalendarDays(todayStr, -1);
  const twoDaysStr = addCalendarDays(todayStr, 2);

  const upcomingStart = clinicLocalToUtc(tomorrowStr, "10:00");
  const upcomingEnd = clinicLocalToUtc(tomorrowStr, "10:30");
  const pastStart = clinicLocalToUtc(yesterdayStr, "11:00");
  const pastEnd = clinicLocalToUtc(yesterdayStr, "11:30");
  const failedAiStart = clinicLocalToUtc(tomorrowStr, "14:00");
  const failedAiEnd = clinicLocalToUtc(tomorrowStr, "14:30");
  const holdStart = clinicLocalToUtc(tomorrowStr, "16:00");
  const holdEnd = clinicLocalToUtc(tomorrowStr, "16:30");
  const cancelledStart = clinicLocalToUtc(twoDaysStr, "09:00");
  const cancelledEnd = clinicLocalToUtc(twoDaysStr, "09:30");

  const admin = await prisma.user.create({
    data: {
      email: "admin@careflow.demo",
      passwordHash,
      role: "ADMIN",
      firstName: "Aisha",
      lastName: "Rahman",
      isDemo: true,
    },
  });

  const patients = await Promise.all(
    [
      { email: "aarav.gupta@careflow.demo", firstName: "Aarav", lastName: "Gupta", phone: "5550101" },
      { email: "meera.iyer@careflow.demo", firstName: "Meera", lastName: "Iyer", phone: "5550102" },
      { email: "kabir.das@careflow.demo", firstName: "Kabir", lastName: "Das", phone: "5550103" },
    ].map((patient) =>
      prisma.user.create({
        data: {
          ...patient,
          passwordHash,
          role: "PATIENT",
          isDemo: true,
          dateOfBirth: new Date("1994-04-12"),
        },
      }),
    ),
  );

  const doctorProfiles = [
    {
      email: "ananya.sharma@careflow.demo",
      firstName: "Ananya",
      lastName: "Sharma",
      specialization: "Cardiology",
      slotDurationMin: 30,
      yearsExperience: 12,
    },
    {
      email: "rohan.mehta@careflow.demo",
      firstName: "Rohan",
      lastName: "Mehta",
      specialization: "Dermatology",
      slotDurationMin: 20,
      yearsExperience: 8,
    },
    {
      email: "priya.nair@careflow.demo",
      firstName: "Priya",
      lastName: "Nair",
      specialization: "General Practice",
      slotDurationMin: 30,
      yearsExperience: 10,
    },
    {
      email: "vikram.joshi@careflow.demo",
      firstName: "Vikram",
      lastName: "Joshi",
      specialization: "Pediatrics",
      slotDurationMin: 30,
      yearsExperience: 9,
    },
    {
      email: "sara.khan@careflow.demo",
      firstName: "Sara",
      lastName: "Khan",
      specialization: "Orthopedics",
      slotDurationMin: 30,
      yearsExperience: 11,
    },
    {
      email: "dev.patel@careflow.demo",
      firstName: "Dev",
      lastName: "Patel",
      specialization: "Neurology",
      slotDurationMin: 30,
      yearsExperience: 14,
    },
  ];

  const doctors = [];
  for (const profile of doctorProfiles) {
    const user = await prisma.user.create({
      data: {
        email: profile.email,
        passwordHash,
        role: "DOCTOR",
        firstName: profile.firstName,
        lastName: profile.lastName,
        isDemo: true,
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id,
        specialization: profile.specialization,
        slotDurationMin: profile.slotDurationMin,
        yearsExperience: profile.yearsExperience,
        isDemo: true,
        bio: "Demo clinician profile for the CareFlow assessment environment. Not a real clinician.",
      },
    });

    await prisma.doctorWorkingHour.createMany({ data: weekdayHours(doctor.id) });
    doctors.push({ ...doctor, user });
  }

  const cardiology = doctors[0]!;
  const dermatology = doctors[1]!;
  const generalPractice = doctors[2]!;
  const aarav = patients[0]!;
  const meera = patients[1]!;
  const kabir = patients[2]!;

  await prisma.doctorLeave.create({
    data: {
      doctorId: dermatology.id,
      startDate: new Date(`${addCalendarDays(todayStr, 7)}T00:00:00.000Z`),
      endDate: new Date(`${addCalendarDays(todayStr, 8)}T00:00:00.000Z`),
      reason: "Demo leave — conference (no patient impact)",
    },
  });

  const upcoming = await prisma.appointment.create({
    data: {
      doctorId: cardiology.id,
      patientId: aarav.id,
      startAt: upcomingStart,
      endAt: upcomingEnd,
      status: "BOOKED",
      occupancyKey: activeOccupancyKey(upcomingStart),
      symptoms: "Occasional chest tightness after climbing stairs, lasting a few minutes.",
      aiPreVisitStatus: "READY",
      aiUrgency: "MEDIUM",
      aiChiefComplaint: "Exertional chest tightness",
      aiKeySymptoms: ["Chest tightness on exertion", "Resolves with rest", "No radiation"],
      aiSuggestedQuestions: [
        "Does the tightness occur at rest or only with activity?",
        "Any associated shortness of breath, nausea, or sweating?",
        "Have you noticed palpitations or lightheadedness?",
      ],
      aiPreVisitGeneratedAt: new Date(),
      calendarSyncStatus: "UNAVAILABLE",
      timeline: {
        create: [
          { code: "SLOT_RESERVED", label: "Slot reserved" },
          { code: "APPOINTMENT_CONFIRMED", label: "Appointment confirmed" },
          { code: "AI_SUMMARY_GENERATED", label: "AI visit briefing generated" },
          { code: "EMAIL_SENT", label: "Confirmation email queued" },
          { code: "CALENDAR_SYNC_FAILED", label: "Calendar sync unavailable" },
        ],
      },
    },
  });

  const completed = await prisma.appointment.create({
    data: {
      doctorId: generalPractice.id,
      patientId: aarav.id,
      startAt: pastStart,
      endAt: pastEnd,
      status: "BOOKED",
      occupancyKey: activeOccupancyKey(pastStart),
      symptoms: "Seasonal allergies and a dry cough for one week.",
      aiPreVisitStatus: "READY",
      aiUrgency: "LOW",
      aiChiefComplaint: "Dry cough with seasonal allergy symptoms",
      clinicalNotes: "Likely allergic rhinitis. Advised antihistamine and follow-up if cough persists.",
      aiPostVisitStatus: "READY",
      patientSummary:
        "Your visit focused on a dry cough likely related to seasonal allergies. Continue the prescribed antihistamine and rest. Contact the clinic if breathing becomes difficult.",
      followUpSteps: ["Take the antihistamine as prescribed", "Follow up in 2 weeks if the cough continues"],
      medicationSchedule: [{ name: "Loratadine 10mg", when: "Once daily in the morning" }],
      calendarSyncStatus: "UNAVAILABLE",
      prescriptions: {
        create: {
          items: [
            {
              name: "Loratadine",
              dosage: "10mg",
              frequency: "Once daily",
              duration: "14 days",
              instructions: "Take in the morning. Demo prescription — not medical advice.",
            },
          ],
          notes: "Demo prescription data.",
        },
      },
      timeline: {
        create: [
          { code: "APPOINTMENT_CONFIRMED", label: "Appointment confirmed" },
          { code: "CONSULTATION", label: "Consultation completed" },
          { code: "PRESCRIPTION_ISSUED", label: "Prescription issued" },
          { code: "FOLLOW_UP", label: "Follow-up noted" },
        ],
      },
    },
  });

  await prisma.medicationReminder.create({
    data: {
      appointmentId: completed.id,
      patientId: aarav.id,
      medicationName: "Loratadine 10mg",
      scheduleLabel: "Every morning",
      nextFireAt: clinicLocalToUtc(tomorrowStr, "08:00"),
      isActive: true,
    },
  });

  const aiFailed = await prisma.appointment.create({
    data: {
      doctorId: cardiology.id,
      patientId: meera.id,
      startAt: failedAiStart,
      endAt: failedAiEnd,
      status: "BOOKED",
      occupancyKey: activeOccupancyKey(failedAiStart),
      symptoms: "Persistent headache for three days with mild dizziness in the afternoon.",
      aiPreVisitStatus: "FAILED",
      aiPreVisitError: "AI briefing could not be generated. Original symptoms are preserved.",
      calendarSyncStatus: "PENDING",
      timeline: {
        create: [
          { code: "APPOINTMENT_CONFIRMED", label: "Appointment confirmed" },
          { code: "AI_SUMMARY_FAILED", label: "AI briefing failed — retry available" },
        ],
      },
    },
  });

  const held = await prisma.appointment.create({
    data: {
      doctorId: generalPractice.id,
      patientId: kabir.id,
      startAt: holdStart,
      endAt: holdEnd,
      status: "HELD",
      occupancyKey: activeOccupancyKey(holdStart),
      heldByUserId: kabir.id,
      heldAt: new Date(),
      holdExpiresAt: new Date(Date.now() + 4 * 60 * 1000),
      symptoms: "Sore throat and low-grade fever since last night.",
      aiPreVisitStatus: "IDLE",
      calendarSyncStatus: "NOT_CONNECTED",
      timeline: {
        create: [{ code: "SLOT_RESERVED", label: "Slot temporarily reserved" }],
      },
    },
  });

  await prisma.appointment.create({
    data: {
      doctorId: dermatology.id,
      patientId: meera.id,
      startAt: cancelledStart,
      endAt: cancelledEnd,
      status: "CANCELLED",
      occupancyKey: null,
      cancelReason: "PATIENT",
      cancelledAt: new Date(),
      symptoms: "Recurring dry patches on both elbows.",
      aiPreVisitStatus: "IDLE",
      calendarSyncStatus: "NOT_CONNECTED",
      timeline: {
        create: [
          { code: "APPOINTMENT_CONFIRMED", label: "Appointment confirmed" },
          { code: "CANCELLED", label: "Cancelled by patient" },
        ],
      },
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: aarav.id,
        appointmentId: upcoming.id,
        type: "BOOKING_CONFIRMATION",
        status: "SENT",
        toEmail: aarav.email,
        subject: "Your CareFlow appointment is confirmed",
        body: "Your cardiology appointment is confirmed for tomorrow morning.",
        sentAt: new Date(),
      },
      {
        userId: meera.id,
        appointmentId: aiFailed.id,
        type: "BOOKING_CONFIRMATION",
        status: "QUEUED",
        toEmail: meera.email,
        subject: "Your CareFlow appointment is confirmed",
        body: "Your appointment is confirmed. A visit briefing will appear when available.",
      },
      {
        userId: kabir.id,
        appointmentId: held.id,
        type: "APPOINTMENT_REMINDER",
        status: "RETRYING",
        retryCount: 1,
        toEmail: kabir.email,
        subject: "Reminder: appointment hold",
        body: "Your selected slot is held. Confirm to finish booking.",
        lastError: "Delivery failed. CareFlow will retry automatically.",
        nextAttemptAt: new Date(Date.now() + 30_000),
      },
      {
        userId: meera.id,
        type: "CANCELLATION",
        status: "FAILED",
        retryCount: 5,
        maxRetries: 5,
        toEmail: meera.email,
        subject: "Appointment cancelled",
        body: "Your dermatology appointment was cancelled.",
        lastError: "Email is not configured. The appointment is unaffected.",
      },
    ],
  });

  const events: Prisma.SystemEventCreateManyInput[] = [
    {
      type: "BOOKING_CREATED",
      message: "Appointment booked for Aarav Gupta with Dr. Ananya Sharma.",
      actorUserId: aarav.id,
      entityType: "appointment",
      entityId: upcoming.id,
    },
    {
      type: "SLOT_HELD",
      message: "Slot held for Kabir Das.",
      actorUserId: kabir.id,
      entityType: "appointment",
      entityId: held.id,
    },
    {
      type: "AI_REQUEST_SUCCEEDED",
      message: "Pre-visit briefing generated.",
      entityType: "appointment",
      entityId: upcoming.id,
    },
    {
      type: "AI_REQUEST_FAILED",
      message: "Pre-visit briefing failed. Original symptoms were preserved.",
      entityType: "appointment",
      entityId: aiFailed.id,
    },
    {
      type: "EMAIL_SENT",
      message: "Booking confirmation sent.",
      entityType: "appointment",
      entityId: upcoming.id,
    },
    {
      type: "EMAIL_RETRY",
      message: "Notification retry scheduled.",
      entityType: "appointment",
      entityId: held.id,
    },
    {
      type: "EMAIL_FAILED",
      message: "Notification failed after retries.",
      actorUserId: admin.id,
    },
    {
      type: "CALENDAR_SYNC_FAILED",
      message: "Google Calendar is not connected. Appointment remains valid.",
      entityType: "appointment",
      entityId: upcoming.id,
    },
    {
      type: "DOCTOR_LEAVE_CREATED",
      message: "Leave recorded for Dr. Rohan Mehta.",
      actorUserId: admin.id,
      entityType: "doctor",
      entityId: dermatology.id,
    },
    {
      type: "APPOINTMENT_CANCELLED",
      message: "Patient cancelled a dermatology appointment.",
      actorUserId: meera.id,
    },
  ];

  await prisma.systemEvent.createMany({ data: events });

  await prisma.job.createMany({
    data: [
      {
        type: "GENERATE_PRE_VISIT_AI",
        status: "FAILED",
        payload: { appointmentId: aiFailed.id },
        retryCount: 1,
        lastError: "AI provider was unavailable. Appointment was not affected.",
      },
      {
        type: "CALENDAR_SYNC",
        status: "QUEUED",
        payload: { appointmentId: upcoming.id, action: "create" },
      },
    ],
  });

  console.log("CareFlow demo seed complete.");
  console.log("Demo password for all accounts: CareFlow!demo1");
  console.log("Admin:    admin@careflow.demo");
  console.log("Patient:  aarav.gupta@careflow.demo");
  console.log("Doctor:   ananya.sharma@careflow.demo");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
