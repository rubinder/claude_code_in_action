import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

const mockCreateProject = vi.fn();
vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

import { useAuth } from "@/hooks/use-auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth", () => {
  describe("signIn", () => {
    test("returns the result from the signIn action", async () => {
      mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());
      let response: any;

      await act(async () => {
        response = await result.current.signIn("test@example.com", "password");
      });

      expect(response).toEqual({ success: false, error: "Invalid credentials" });
      expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password");
    });

    test("navigates to anon work project when sign in succeeds with anon data", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "App.tsx": { content: "code" } },
      });
      mockCreateProject.mockResolvedValue({ id: "proj-anon-123" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "hello" }],
          data: { "App.tsx": { content: "code" } },
        })
      );
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-anon-123");
    });

    test("navigates to most recent project when no anon work exists", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockPush).toHaveBeenCalledWith("/proj-1");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    test("creates a new project when no anon work and no existing projects", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "new-proj-456" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [],
          data: {},
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/new-proj-456");
    });

    test("does not navigate when sign in fails", async () => {
      mockSignIn.mockResolvedValue({ success: false, error: "bad password" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "wrong");
      });

      expect(mockPush).not.toHaveBeenCalled();
      expect(mockGetAnonWorkData).not.toHaveBeenCalled();
    });

    test("treats anon work with empty messages as no anon work", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockGetProjects.mockResolvedValue([{ id: "existing-proj" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@example.com", "password");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockClearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-proj");
    });
  });

  describe("signUp", () => {
    test("returns the result from the signUp action", async () => {
      mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());
      let response: any;

      await act(async () => {
        response = await result.current.signUp("test@example.com", "password");
      });

      expect(response).toEqual({ success: false, error: "Email already registered" });
      expect(mockSignUp).toHaveBeenCalledWith("test@example.com", "password");
    });

    test("navigates to anon work project when sign up succeeds with anon data", async () => {
      mockSignUp.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "make a button" }],
        fileSystemData: { "Button.tsx": { content: "button code" } },
      });
      mockCreateProject.mockResolvedValue({ id: "proj-signup-789" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/proj-signup-789");
    });

    test("does not navigate when sign up fails", async () => {
      mockSignUp.mockResolvedValue({ success: false, error: "Email taken" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("taken@example.com", "password");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("creates a new project when sign up succeeds with no anon work or projects", async () => {
      mockSignUp.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "brand-new" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("fresh@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/brand-new");
    });
  });

  describe("isLoading", () => {
    test("starts as false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    test("resets to false after successful signIn", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "p1" }]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass1234");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets to false after failed signIn", async () => {
      mockSignIn.mockResolvedValue({ success: false, error: "fail" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "pass1234");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets to false even when signIn action throws", async () => {
      mockSignIn.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signIn("a@b.com", "pass")).rejects.toThrow("Network error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets to false even when signUp action throws", async () => {
      mockSignUp.mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signUp("a@b.com", "pass")).rejects.toThrow("Server error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets to false even when post-signIn navigation throws", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockRejectedValue(new Error("DB error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signIn("a@b.com", "pass")).rejects.toThrow("DB error");
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
