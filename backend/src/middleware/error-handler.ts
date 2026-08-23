import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";
import { apiError } from "../utils/api-response.js";

function isPrismaUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json(apiError(error.code, error.message, error.details));
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json(
      apiError("VALIDATION_ERROR", "Please check the highlighted fields and try again.", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    );
    return;
  }

  if (isPrismaUniqueViolation(error)) {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
    if (target.includes("occupancy_key") || target.includes("appointments_active_slot_key")) {
      res.status(409).json(
        apiError("SLOT_UNAVAILABLE", "This appointment slot is no longer available."),
      );
      return;
    }
    res.status(409).json(apiError("CONFLICT", "This record already exists."));
    return;
  }

  console.error("[unhandled-error]", error instanceof Error ? error.message : "unknown");
  res.status(500).json(
    apiError("INTERNAL_ERROR", "Something went wrong. Please try again in a moment."),
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(apiError("NOT_FOUND", "The requested resource was not found."));
}
