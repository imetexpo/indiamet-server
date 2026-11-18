const { Resend } = require("resend");

class EmailService {
  constructor() {
    this.initialized = false;
    this.resend = null;
    this.init();
  }

  init() {
    if (!process.env.RESEND_API_KEY) {
      console.error("❌ RESEND_API_KEY is missing in environment variables");
      return;
    }

    if (!process.env.RESEND_FROM) {
      console.error("❌ RESEND_FROM is missing in environment variables");
      return;
    }

    try {
      this.resend = new Resend(process.env.RESEND_API_KEY);

      this.initialized = true;

      console.log("✅ Email Service initialized with Resend");
      console.log(`📧 From email: ${process.env.RESEND_FROM}`);
    } catch (error) {
      console.error("❌ Failed to initialize Resend:", error.message);
    }
  }

  async sendEmail(to, subject, html) {
    if (!this.initialized) {
      console.error("❌ Email service not initialized");

      return {
        success: false,
        error: "Resend not initialized",
      };
    }

    try {
      console.log(`📧 Attempting to send email:`);
      console.log(`   To: ${to}`);
      console.log(`   From: ${process.env.RESEND_FROM}`);
      console.log(`   Subject: ${subject}`);

      const response = await this.resend.emails.send({
        from: process.env.RESEND_FROM,
        to,
        subject,
        html,
      });

      if (response.error || !response.data?.id) {
        throw new Error(response.error?.message || "Resend did not return a message ID");
      }

      console.log(`✅ Email sent successfully to ${to}`);

      return {
        success: true,
        messageId: response.data.id,
      };
    } catch (error) {
      console.error("❌ Resend Error:", error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendEmailWithAttachment({ to, subject, html, attachment }) {
    if (!this.initialized) {
      console.error("❌ Email service not initialized");

      return {
        success: false,
        error: "Resend not initialized",
      };
    }

    try {
      const response = await this.resend.emails.send({
        from: process.env.RESEND_FROM,
        to,
        subject,
        html,

        attachments: [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentId: attachment.cid,
            contentType: attachment.contentType,
          },
        ],
      });

      if (response.error || !response.data?.id) {
        throw new Error(response.error?.message || "Resend did not return a message ID");
      }

      console.log(`✅ Email with attachment sent successfully to ${to}`);

      return {
        success: true,
        messageId: response.data.id,
      };
    } catch (error) {
      console.error("❌ Resend Attachment Error:", error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send password reset email with reset link
   */
  async sendPasswordResetEmail(email, name, resetUrl) {
    const subject = "🔒 Reset Your Password - IndiaMET 2027 Exhibitor Portal";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - IndiaMET 2027</title>
      </head>

      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:40px 0;">

              <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">

                <tr>
                  <td style="background:#003A77;padding:35px 20px;text-align:center;">
                    <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:200px;display:block;margin:0 auto 10px;" alt="IndiaMET 2027 Logo" />
                    <p style="color:#00A1B1;margin:0;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Exhibitor Portal</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:40px;">

                    <h2>Password Reset Request</h2>

                    <p>Hello <strong>${name || "Exhibitor"}</strong>,</p>

                    <p>
                      We received a request to reset your password.
                    </p>

                    <div style="text-align:center;margin:40px 0;">
                      <a
                        href="${resetUrl}"
                        style="
                          background:#004D9F;
                          color:#fff;
                          text-decoration:none;
                          padding:15px 30px;
                          border-radius:50px;
                          display:inline-block;
                        "
                      >
                        Reset Password
                      </a>
                    </div>

                    <p>This link expires in 1 hour.</p>

                    <p>
                      If the button does not work, copy this URL:
                    </p>

                    <p
                      style="
                        background:#f1f1f1;
                        padding:15px;
                        border-radius:8px;
                        word-break:break-all;
                      "
                    >
                      ${resetUrl}
                    </p>

                    <hr />

                    <p style="font-size:12px;color:#999;">
                      This email was sent to ${email}
                    </p>

                  </td>
                </tr>

              </table>

            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return this.sendEmail(email, subject, html);
  }

  /**
   * Password reset success
   */
  async sendPasswordResetConfirmation(email, name) {
    const subject =
      "✅ Password Reset Successful - IndiaMET 2027 Exhibitor Portal";

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:40px;">

        <div
          style="
            max-width:600px;
            margin:auto;
            background:#fff;
            border-radius:12px;
            overflow:hidden;
            box-shadow:0 4px 12px rgba(0,0,0,0.1);
          "
        >

          <div
            style="
              background:#003A77;
              padding:40px;
              text-align:center;
              color:#fff;
            "
          >
            <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:200px;display:block;margin:0 auto 10px;" alt="IndiaMET 2027 Logo" />
            <h1 style="margin:10px 0 0;font-size:24px;">Password Reset Successful</h1>
          </div>

          <div style="padding:40px;">

            <p>Hello ${name || "Exhibitor"},</p>

            <p>
              Your password has been successfully reset.
            </p>

            <div style="text-align:center;margin-top:30px;">
              <a
                href="${process.env.FRONTEND_URL || "http://localhost:3000"}/login"
                style="
                  background:#004D9F;
                  color:#fff;
                  text-decoration:none;
                  padding:15px 30px;
                  border-radius:50px;
                "
              >
                Go To Login
              </a>
            </div>

            <hr style="margin-top:40px;" />

            <p style="font-size:12px;color:#999;">
              This email was sent to ${email}
            </p>

          </div>

        </div>

      </body>
      </html>
    `;

    return this.sendEmail(email, subject, html);
  }

  /**
   * Exhibitor welcome
   */
  async sendExhibitorWelcome(exhibitor, plainPassword) {
    const subject =
      "Welcome to IndiaMET 2027 Exhibitor Portal - Login Credentials";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <div style="background:#003A77;padding:30px;text-align:center;">
          <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:200px;display:block;margin:0 auto;" alt="IndiaMET 2027 Logo" />
        </div>
        <div style="padding:30px;background:#ffffff;border:1px solid #e2e8f0;">
          <h2 style="color:#003A77;margin-top:0;">Welcome to IndiaMET 2027 Exhibitor Portal</h2>
          <p>Dear ${exhibitor.name},</p>
          <p>Your exhibitor account has been created successfully for <strong>IndiaMET 2027</strong> (13–15 May 2027, Auto Cluster Exhibition Centre, Pune).</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p><strong>Email:</strong> ${exhibitor.email}</p>
          <p><strong>Password:</strong> ${plainPassword}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p>Please login and change your password immediately for security.</p>
          <p style="margin:25px 0;">
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/login" style="background:#003A77;color:#fff;text-decoration:none;padding:12px 28px;border-radius:25px;display:inline-block;font-weight:bold;">
              Login to Exhibitor Portal
            </a>
          </p>
          <p>Best regards,<br /><strong style="color:#003A77;">IndiaMET 2027 Exhibition Team</strong></p>
        </div>
      </div>
    `;

    return this.sendEmail(exhibitor.email, subject, html);
  }

  /**
   * Visitor OTP
   */
  async sendVisitorOTP(email, name, otp) {
    const subject = "Your Verification Code - IndiaMET 2027";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:550px;margin:auto;padding:20px;">
        <div style="text-align:center;margin-bottom:20px;">
          <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:180px;" alt="IndiaMET 2027" />
        </div>
        <div style="background:#fff;border-radius:12px;padding:30px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color:#003A77;margin-top:0;">Email Verification</h2>
          <p>Dear ${name || 'Visitor'},</p>
          <p>Your verification code for IndiaMET 2027 registration is:</p>
          <h1 style="font-size:36px;letter-spacing:8px;text-align:center;background:#E8F1F8;color:#003A77;padding:20px;border-radius:8px;margin:25px 0;">
            ${otp}
          </h1>
          <p style="font-size:13px;color:#64748b;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
          <p style="font-size:13px;color:#003A77;margin-top:20px;font-weight:bold;">IndiaMET 2027 Team</p>
        </div>
      </div>
    `;

    return this.sendEmail(email, subject, html);
  }

  /**
   * Visitor confirmation
   */
  async sendVisitorConfirmation(visitorData) {
    const subject = "Registration Confirmed - IndiaMET 2027";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <div style="background:#003A77;padding:25px;text-align:center;">
          <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:200px;display:block;margin:0 auto;" alt="IndiaMET 2027 Logo" />
        </div>
        <div style="padding:30px;background:#ffffff;border:1px solid #e2e8f0;">
          <h2 style="color:#003A77;margin-top:0;">Registration Confirmed!</h2>
          <p>Dear ${visitorData.name},</p>
          <p>Your registration for <strong>IndiaMET 2027 Exhibition &amp; Summit</strong> has been successfully completed.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p><strong>Name:</strong> ${visitorData.name}</p>
          <p><strong>Company:</strong> ${visitorData.company || 'N/A'}</p>
          <p><strong>Email:</strong> ${visitorData.email}</p>
          <p><strong>Event Dates:</strong> 13–15 May 2027</p>
          <p><strong>Venue:</strong> Auto Cluster Exhibition Centre, Pune, India</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p>We look forward to seeing you at the exhibition!</p>
          <p>Best regards,<br /><strong style="color:#003A77;">IndiaMET 2027 Team</strong></p>
        </div>
      </div>
    `;

    return this.sendEmail(visitorData.email, subject, html);
  }

  /**
   * Invoice email
   */
  async sendInvoiceEmail({
    to,
    invoiceNumber,
    amount,
    pdfBuffer,
    dueDate,
  }) {
    try {
      const subject = `Invoice ${invoiceNumber} from IndiaMET 2027 Exhibition`;

      const html = `
        <!DOCTYPE html>
        <html>
        <body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">

          <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">

            <div style="background:#003A77;padding:30px;text-align:center;">
              <img src="https://res.cloudinary.com/deo4vpw8f/image/upload/v1793946695/indimet_LOGO_cusfu7.png" style="max-width:200px;display:block;margin:0 auto;" alt="IndiaMET 2027 Logo" />
            </div>

            <div style="padding:30px;">
              <h2 style="color:#003A77;margin-top:0;">Invoice ${invoiceNumber}</h2>

              <p>Dear Exhibitor,</p>

              <p>
                Please find your invoice attached for <strong>IndiaMET 2027</strong>.
              </p>

              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

              <p>
                <strong>Invoice Number:</strong>
                ${invoiceNumber}
              </p>

              <p>
                <strong>Amount:</strong>
                ₹${amount.toLocaleString()}
              </p>

              <p>
                <strong>Due Date:</strong>
                ${new Date(dueDate).toLocaleDateString("en-IN")}
              </p>

              <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

              <p>
                Best regards,<br />
                <strong style="color:#003A77;">IndiaMET 2027 Team</strong>
              </p>
            </div>

          </div>

        </body>
        </html>
      `;

      return await this.sendEmailWithAttachment({
        to,
        subject,
        html,

        attachment: {
          filename: `invoice-${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      });
    } catch (error) {
      console.error("❌ Failed to send invoice email:", error);

      throw error;
    }
  }

  /**
   * Test Resend config
   */
  async testConnection() {
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.RESEND_FROM
    ) {
      throw new Error(
        "Resend environment variables missing"
      );
    }

    console.log("✅ Resend configuration OK");
    console.log(`📧 From: ${process.env.RESEND_FROM}`);

    return true;
  }
}

module.exports = new EmailService();