import nodemailer from 'nodemailer';
import axios from 'axios';

// Use Mailtrap for testing if credentials are provided, otherwise use configured SMTP
const isMailtrap = process.env.EMAIL_HOST?.includes('mailtrap') || process.env.EMAIL_USER?.includes('mailtrap');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.office365.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // For Mailtrap, use different settings
  ...(isMailtrap && {
    port: 2525,
    secure: false,
    tls: {
      rejectUnauthorized: false
    }
  })
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const POWERAUTOMATE_ENABLED = process.env.POWERAUTOMATE_ENABLED === 'true';
const POWERAUTOMATE_WEBHOOK_URL = process.env.POWERAUTOMATE_WEBHOOK_URL || '';

// Send email via PowerAutomate webhook
async function sendViaPowerAutomate(
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  recipientName: string
) {
  if (!POWERAUTOMATE_ENABLED || !POWERAUTOMATE_WEBHOOK_URL) {
    return false;
  }

  try {
    await axios.post(POWERAUTOMATE_WEBHOOK_URL, {
      to: recipientEmail,
      subject: subject,
      body: htmlContent,
      recipientName: recipientName,
    });
    console.log(`✅ PowerAutomate notification sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('❌ PowerAutomate notification failed:', error);
    return false;
  }
}

// Send email via SMTP
async function sendViaSMTP(
  recipientEmail: string,
  subject: string,
  htmlContent: string
) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@easysign.com',
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
    });
    console.log(`✅ SMTP email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('❌ SMTP email sending failed:', error);
    return false;
  }
}

export async function sendDocumentAssignmentEmail(
  recipientEmail: string,
  recipientName: string,
  documentTitle: string,
  documentId: number,
  password?: string
) {
  const loginUrl = `${FRONTEND_URL}/login?document=${documentId}`;
  
  // Log URL and password for testing
  console.log('\n📧 EMAIL NOTIFICATION DETAILS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📬 To: ${recipientEmail}`);
  console.log(`📄 Document: ${documentTitle}`);
  console.log(`🔗 Login URL: ${loginUrl}`);
  if (password) {
    console.log(`🔑 Generated Password: ${password}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">EasySign</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Document Signing Request</h2>
        <p style="color: #666; font-size: 16px;">Hello ${recipientName},</p>
        <p style="color: #666; font-size: 16px;">You have been assigned a document to sign:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${documentTitle}</p>
        </div>
        ${password ? `
          <div style="background: #fff3cd; border: 2px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #856404; font-weight: bold;">Your Login Credentials:</p>
            <p style="margin: 5px 0; color: #333;">
              <strong>Email:</strong> ${recipientEmail}<br>
              <strong>Password:</strong> <span style="font-size: 20px; letter-spacing: 2px; color: #d9534f;">${password}</span>
            </p>
            <p style="margin: 10px 0 0 0; color: #856404; font-size: 14px;">
              ⚠️ Please save this password. You'll need it to sign the document.
            </p>
          </div>
        ` : `
          <p style="color: #666;">Please log in with your existing account to sign this document.</p>
        `}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
            Sign Document Now
          </a>
        </div>
        <p style="color: #999; font-size: 14px; text-align: center; margin-top: 20px;">
          Or copy and paste this link in your browser:<br>
          <a href="${loginUrl}" style="color: #667eea; word-break: break-all;">${loginUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from EasySign. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
  
  // Try SMTP first (primary method for now)
  let smtpSuccess = false;
  try {
    smtpSuccess = await sendViaSMTP(
      recipientEmail,
      `Document Signing Request: ${documentTitle}`,
      html
    );
  } catch (error) {
    console.error('SMTP failed, trying PowerAutomate...', error);
  }

  // Try PowerAutomate if SMTP failed and it's enabled
  if (!smtpSuccess && POWERAUTOMATE_ENABLED) {
    try {
      const powerAutomateSuccess = await sendViaPowerAutomate(
        recipientEmail,
        `Document Signing Request: ${documentTitle}`,
        html,
        recipientName
      );
      if (powerAutomateSuccess) {
        console.log('✅ Email sent via PowerAutomate (SMTP fallback)');
        return;
      }
    } catch (error) {
      console.error('PowerAutomate also failed:', error);
    }
  }

  // If both failed, log but don't throw (allow document assignment to continue)
  if (!smtpSuccess) {
    console.error(`❌ Failed to send email to ${recipientEmail}`);
    console.error('⚠️  Document assigned but email notification failed. User can still access via login.');
    // Don't throw error - allow assignment to complete
  }
}

export async function sendDocumentSignedNotification(
  senderEmail: string,
  senderName: string,
  documentTitle: string,
  signerName: string,
  documentId?: number
) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const previewUrl = documentId 
    ? `${frontendUrl}/documents/${documentId}/preview`
    : `${frontendUrl}/dashboard`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">EasySign</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Document Signed Successfully</h2>
        <p style="color: #666; font-size: 16px;">Hello ${senderName},</p>
        <p style="color: #666; font-size: 16px;"><strong>${signerName}</strong> has signed the document:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${documentTitle}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${previewUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
            Preview Signed Document
          </a>
        </div>
        <p style="color: #999; font-size: 14px; text-align: center; margin-top: 20px;">
          Or copy and paste this link in your browser:<br>
          <a href="${previewUrl}" style="color: #667eea; word-break: break-all;">${previewUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from EasySign. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
  
  // Try SMTP first (primary method for now)
  let smtpSuccess = false;
  try {
    smtpSuccess = await sendViaSMTP(
      senderEmail,
      `Document Signed: ${documentTitle}`,
      html
    );
  } catch (error) {
    console.error('SMTP failed, trying PowerAutomate...', error);
  }

  // Try PowerAutomate if SMTP failed and it's enabled
  if (!smtpSuccess && POWERAUTOMATE_ENABLED) {
    try {
      const powerAutomateSuccess = await sendViaPowerAutomate(
        senderEmail,
        `Document Signed: ${documentTitle}`,
        html,
        senderName
      );
      if (powerAutomateSuccess) {
        console.log('✅ Notification sent via PowerAutomate (SMTP fallback)');
        return;
      }
    } catch (error) {
      console.error('PowerAutomate also failed:', error);
    }
  }

  if (!smtpSuccess) {
    console.error('⚠️  Failed to send notification email, but document signing completed');
  }
}

// Send email with attachment
async function sendEmailWithAttachment(
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  attachmentPath: string,
  attachmentName: string
) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@easysign.com',
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
      attachments: [
        {
          path: attachmentPath,
          filename: attachmentName,
        },
      ],
    });
    console.log(`✅ Email with attachment sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email with attachment:', error);
    return false;
  }
}

// Send email via PowerAutomate with attachment
async function sendViaPowerAutomateWithAttachment(
  recipientEmail: string,
  subject: string,
  htmlContent: string,
  recipientName: string,
  attachmentPath: string,
  attachmentName: string
) {
  if (!POWERAUTOMATE_ENABLED || !POWERAUTOMATE_WEBHOOK_URL) {
    return false;
  }

  try {
    // Read file and convert to base64
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(attachmentPath);
    const base64File = fileBuffer.toString('base64');

    await axios.post(POWERAUTOMATE_WEBHOOK_URL, {
      to: recipientEmail,
      subject: subject,
      body: htmlContent,
      recipientName: recipientName,
      attachment: base64File,
      attachmentName: attachmentName,
      hasAttachment: true,
    });
    console.log(`✅ PowerAutomate email with attachment sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('❌ PowerAutomate email with attachment failed:', error);
    return false;
  }
}

export async function sendDocumentForwardEmail(
  recipientEmail: string,
  recipientName: string,
  senderName: string,
  documentTitle: string,
  documentId: number,
  attachmentPath: string,
  attachmentName: string,
  isExternal: boolean = false
) {
  const loginUrl = isExternal ? null : `${FRONTEND_URL}/documents/${documentId}/preview`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">EasySign</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Document Forwarded</h2>
        <p style="color: #666; font-size: 16px;">Hello ${recipientName},</p>
        <p style="color: #666; font-size: 16px;"><strong>${senderName}</strong> has forwarded a document to you:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${documentTitle}</p>
        </div>
        ${loginUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
              View Document
            </a>
          </div>
        ` : `
          <p style="color: #666; font-size: 16px;">The document is attached to this email.</p>
        `}
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from EasySign. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  // Try SMTP first
  let smtpSuccess = false;
  try {
    if (isExternal) {
      smtpSuccess = await sendEmailWithAttachment(
        recipientEmail,
        `Document Forwarded: ${documentTitle}`,
        html,
        attachmentPath,
        attachmentName
      );
    } else {
      smtpSuccess = await sendViaSMTP(
        recipientEmail,
        `Document Forwarded: ${documentTitle}`,
        html
      );
    }
  } catch (error) {
    console.error('SMTP failed, trying PowerAutomate...', error);
  }

  // Try PowerAutomate if SMTP failed
  if (!smtpSuccess && POWERAUTOMATE_ENABLED) {
    try {
      const powerAutomateSuccess = isExternal
        ? await sendViaPowerAutomateWithAttachment(
            recipientEmail,
            `Document Forwarded: ${documentTitle}`,
            html,
            recipientName,
            attachmentPath,
            attachmentName
          )
        : await sendViaPowerAutomate(
            recipientEmail,
            `Document Forwarded: ${documentTitle}`,
            html,
            recipientName
          );
      if (powerAutomateSuccess) {
        console.log('✅ Forward email sent via PowerAutomate');
        return;
      }
    } catch (error) {
      console.error('PowerAutomate also failed:', error);
    }
  }

  if (!smtpSuccess) {
    console.error(`❌ Failed to send forward email to ${recipientEmail}`);
  }
}

export async function sendDocumentBackEmail(
  recipientEmail: string,
  recipientName: string,
  senderName: string,
  documentTitle: string,
  note: string,
  documentId: number
) {
  const loginUrl = `${FRONTEND_URL}/documents/${documentId}/sign`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0;">EasySign</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <h2 style="color: #333; margin-top: 0;">Document Sent Back for Revision</h2>
        <p style="color: #666; font-size: 16px;">Hello ${recipientName},</p>
        <p style="color: #666; font-size: 16px;">The document you signed has been sent back for revision:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${documentTitle}</p>
        </div>
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #856404; font-weight: bold;">Note from ${senderName}:</p>
          <p style="margin: 0; color: #333; white-space: pre-wrap;">${note}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background-color: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
            Review and Sign Again
          </a>
        </div>
        <p style="color: #999; font-size: 14px; text-align: center; margin-top: 20px;">
          Or copy and paste this link in your browser:<br>
          <a href="${loginUrl}" style="color: #667eea; word-break: break-all;">${loginUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from EasySign. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  // Try SMTP first
  let smtpSuccess = false;
  try {
    smtpSuccess = await sendViaSMTP(
      recipientEmail,
      `Document Sent Back: ${documentTitle}`,
      html
    );
  } catch (error) {
    console.error('SMTP failed, trying PowerAutomate...', error);
  }

  // Try PowerAutomate if SMTP failed
  if (!smtpSuccess && POWERAUTOMATE_ENABLED) {
    try {
      const powerAutomateSuccess = await sendViaPowerAutomate(
        recipientEmail,
        `Document Sent Back: ${documentTitle}`,
        html,
        recipientName
      );
      if (powerAutomateSuccess) {
        console.log('✅ Send back email sent via PowerAutomate');
        return;
      }
    } catch (error) {
      console.error('PowerAutomate also failed:', error);
    }
  }

  if (!smtpSuccess) {
    console.error(`❌ Failed to send document back email to ${recipientEmail}`);
  }
}

