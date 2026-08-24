const configured = import.meta.env.VITE_API_URL?.trim();

function resolveApiUrl(): string {
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:4000";
  }
  throw new Error(
    "VITE_API_URL is missing. Set it to the production API origin (for example https://api.example.com) before building the frontend.",
  );
}

const API_URL = resolveApiUrl();

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export function authErrorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiRequestError) {
    return caught.message;
  }
  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError(
      "NETWORK_ERROR",
      "Unable to reach the CareFlow server. Please try again in a moment.",
      0,
    );
  }

  let body: ApiSuccess<T> | ApiError;
  try {
    body = (await response.json()) as ApiSuccess<T> | ApiError;
  } catch {
    throw new ApiRequestError(
      "INTERNAL_ERROR",
      response.status
        ? `The server returned an unexpected response (${response.status}). Please try again.`
        : "Something went wrong. Please try again.",
      response.status,
    );
  }

  if (!body.success) {
    throw new ApiRequestError(body.error.code, body.error.message, response.status);
  }

  return body.data;
}

export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return apiRequest<T>(path, { token });
}
