import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App", () => {
  it("renders the shell heading", () => {
    render(<App />);
    expect(screen.getByText("Access Assurance Hub")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
  });
});
