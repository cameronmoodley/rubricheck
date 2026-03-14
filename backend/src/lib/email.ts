import { Resend } from "resend";
import { logger } from "./logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || "RubriCheck <onboarding@resend.dev>";

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  userName: string
): Promise<boolean> {
  if (!resend) {
    logger.warn("RESEND_API_KEY not set - skipping password reset email");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Reset your RubriCheck password",
      html: `
        <p>Hi ${userName},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, you can ignore this email.</p>
        <p>— RubriCheck</p>
      `,
    });

    if (error) {
      logger.error({ err: error }, "Failed to send password reset email");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send password reset email");
    return false;
  }
}

export async function sendGradingCompleteEmail(
  to: string,
  userName: string,
  paperCount: number,
  appUrl: string
): Promise<boolean> {
  if (!resend) {
    logger.debug("RESEND_API_KEY not set - skipping grading complete email");
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `RubriCheck: ${paperCount} paper(s) graded`,
      html: `
        <p>Hi ${userName},</p>
        <p>Your grading for ${paperCount} paper(s) is complete.</p>
        <p><a href="${appUrl}">View results</a></p>
        <p>— RubriCheck</p>
      `,
    });

    if (error) {
      logger.error({ err: error }, "Failed to send grading complete email");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send grading complete email");
    return false;
  }
}
