/**
 * Default email templates — Handlebars versions of every notification template.
 *
 * These are seeded into the notification_templates table on first run.
 * Admin edits are preserved (seed uses INSERT OR IGNORE).
 */

// ---------------------------------------------------------------------------
// Shared HTML wrapper (table-based, 600px centered, white card on gray bg)
// ---------------------------------------------------------------------------

const YEAR = "{{currentYear}}";

function layoutOpen(title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 0; text-align: center;">
        <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">`;
}

const LAYOUT_CLOSE = `        </table>
        <p style="margin-top: 20px; color: #a0aec0; font-size: 12px;">&copy; ${YEAR} {{brandName}}. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

function hd(text: string): string {
  return `<tr>
  <td style="padding: 40px 40px 20px 40px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">${text}</h1>
  </td>
</tr>`;
}

function p(html: string): string {
  return `<tr>
  <td style="padding: 0 40px 20px 40px; color: #4a5568; font-size: 16px; line-height: 24px;">
    ${html}
  </td>
</tr>`;
}

function btn(urlExpr: string, label: string, color = "#2563eb"): string {
  return `<tr>
  <td style="padding: 0 40px 30px 40px; text-align: center;">
    <a href="${urlExpr}" style="display: inline-block; padding: 12px 32px; background-color: ${color}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 16px;">${label}</a>
  </td>
</tr>`;
}

function ft(text: string): string {
  return `<tr>
  <td style="padding: 0 40px 40px 40px; color: #718096; font-size: 14px; line-height: 20px; border-top: 1px solid #e2e8f0;">
    <p style="margin-top: 20px;">${text}</p>
  </td>
</tr>`;
}

function html(title: string, ...rows: string[]): string {
  return `${layoutOpen(title)}\n${rows.join("\n")}\n${LAYOUT_CLOSE}`;
}

const CR = `\n\n(c) ${YEAR} {{brandName}}. All rights reserved.`;

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface DefaultTemplate {
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  // -- Credits & Billing ---------------------------------------------------
  {
    name: "credits-depleted",
    description: "Sent when tenant credit balance reaches zero",
    subject: "Your {{brandName}} credits are depleted \u2014 capabilities paused",
    htmlBody: html(
      "Credits Depleted",
      hd("Your {{brandName}} Credits Are Depleted"),
      p(
        "<p>Your {{brandName}} credit balance has reached $0. All agent capabilities have been paused.</p><p>Add credits now to resume service immediately.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Add Credits")}{{/if}}`,
      ft("Your data is preserved. Add credits to reactivate."),
    ),
    textBody: `Your {{brandName}} Credits Are Depleted

Your {{brandName}} credit balance has reached $0. All agent capabilities have been paused.

Add credits now to resume service immediately.
{{#if creditsUrl}}
Add credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "grace-period-start",
    description: "Sent when a tenant enters the grace period after failed billing",
    subject: "Action needed: top up to keep your {{brandName}} agents running",
    htmlBody: html(
      "Grace Period Started",
      hd("Action Needed: Top Up to Keep Your {{brandName}} Agents Running"),
      p(
        "<p>Your current balance is <strong>{{balanceDollars}}</strong> and the monthly deduction could not be processed.</p><p>You have a <strong>{{graceDays}}-day grace period</strong> to add credits before your account is suspended.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Add Credits Now")}{{/if}}`,
      ft("This is a critical notification about your account status."),
    ),
    textBody: `Action Needed: Top Up to Keep Your {{brandName}} Agents Running

Your current balance is {{balanceDollars}} and the monthly deduction could not be processed.

You have a {{graceDays}}-day grace period to add credits before your account is suspended.
{{#if creditsUrl}}
Add credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "grace-period-warning",
    description: "Sent one day before grace period expires",
    subject: "Last chance: your agents will be suspended tomorrow",
    htmlBody: html(
      "Grace Period Warning",
      hd("Last Chance: Your Agents Will Be Suspended Tomorrow"),
      p(
        "<p>Your grace period expires tomorrow. If you do not add credits, your account will be suspended.</p><p>Add credits now to keep your agents running.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Add Credits Now", "#dc2626")}{{/if}}`,
      ft("This is a critical notification about your account status."),
    ),
    textBody: `Last Chance: Your Agents Will Be Suspended Tomorrow

Your grace period expires tomorrow. If you do not add credits, your account will be suspended.
{{#if creditsUrl}}
Add credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "auto-suspended",
    description: "Sent when account is automatically suspended",
    subject: "Your account has been suspended",
    htmlBody: html(
      "Account Suspended",
      hd("Your Account Has Been Suspended"),
      p(
        "<p>Your {{brandName}} account has been automatically suspended.</p><p><strong>Reason:</strong> {{reason}}</p><p>Add credits to reactivate your account immediately.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Add Credits to Reactivate")}{{/if}}`,
      ft("Your data is preserved for 30 days."),
    ),
    textBody: `Your Account Has Been Suspended

Reason: {{reason}}

Add credits to reactivate your account immediately.
{{#if creditsUrl}}
Add credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "auto-topup-success",
    description: "Sent after a successful auto top-up charge",
    subject: "Auto top-up: {{amountDollars}} credits added",
    htmlBody: html(
      "Auto Top-Up Successful",
      hd("Auto Top-Up: {{amountDollars}} Credits Added"),
      p(
        "<p>Your auto top-up was successful. <strong>{{amountDollars}}</strong> in credits has been added.</p><p>Your new balance is <strong>{{newBalanceDollars}}</strong>.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "View Credits")}{{/if}}`,
      ft("Auto top-up keeps your agents running without interruption."),
    ),
    textBody: `Auto Top-Up: {{amountDollars}} Credits Added

Your auto top-up was successful. {{amountDollars}} in credits has been added.

Your new balance is {{newBalanceDollars}}.
{{#if creditsUrl}}
View credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "auto-topup-failed",
    description: "Sent when auto top-up charge fails",
    subject: "Auto top-up failed \u2014 update your payment method",
    htmlBody: html(
      "Auto Top-Up Failed",
      hd("Auto Top-Up Failed"),
      p(
        "<p>Your auto top-up failed. We were unable to charge your payment method.</p><p>Please update your payment method or add credits manually to avoid service interruption.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Add Credits")}{{/if}}`,
      ft("If you need help, contact {{supportEmail}}."),
    ),
    textBody: `Auto Top-Up Failed

Your auto top-up failed. We were unable to charge your payment method.

Please update your payment method or add credits manually to avoid service interruption.
{{#if creditsUrl}}
Add credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "crypto-payment-confirmed",
    description: "Sent when a crypto payment is confirmed on-chain",
    subject: "Crypto payment confirmed: {{amountDollars}} credits added",
    htmlBody: html(
      "Crypto Payment Confirmed",
      hd("Crypto Payment Confirmed: {{amountDollars}} Credits Added"),
      p(
        "<p>Your crypto payment has been confirmed. <strong>{{amountDollars}}</strong> in credits has been added to your account.</p><p>Your new balance is <strong>{{newBalanceDollars}}</strong>.</p>",
      ),
      ft("Thank you for supporting {{brandName}}!"),
    ),
    textBody: `Crypto Payment Confirmed: {{amountDollars}} Credits Added

Your crypto payment has been confirmed. {{amountDollars}} in credits has been added.

Your new balance is {{newBalanceDollars}}.${CR}`,
  },
  // -- Account Administration -----------------------------------------------
  {
    name: "admin-suspended",
    description: "Sent when an admin manually suspends an account",
    subject: "Your account has been suspended",
    htmlBody: html(
      "Account Suspended",
      hd("Your Account Has Been Suspended"),
      p(
        "<p>Your {{brandName}} account has been suspended by an administrator.</p><p><strong>Reason:</strong> {{reason}}</p><p>If you believe this is an error, please contact {{supportEmail}}.</p>",
      ),
      ft("Contact {{supportEmail}} if you have questions."),
    ),
    textBody: `Your Account Has Been Suspended

Reason: {{reason}}

If you believe this is an error, please contact {{supportEmail}}.${CR}`,
  },
  {
    name: "admin-reactivated",
    description: "Sent when an admin reactivates a suspended account",
    subject: "Your account has been reactivated",
    htmlBody: html(
      "Account Reactivated",
      hd("Your Account Has Been Reactivated"),
      p(
        "<p>Your {{brandName}} account has been reactivated. You now have full access to all services.</p><p>Your agents and channels are ready to use.</p>",
      ),
      ft("Welcome back!"),
    ),
    textBody: `Your Account Has Been Reactivated

Your {{brandName}} account has been reactivated. You now have full access to all services.${CR}`,
  },
  {
    name: "credits-granted",
    description: "Sent when credits are manually granted to a tenant",
    subject: "You received {{amountDollars}} in credits",
    htmlBody: html(
      "Credits Granted",
      hd("You Received {{amountDollars}} in Credits"),
      p(
        "<p><strong>{{amountDollars}}</strong> in credits has been added to your {{brandName}} account.</p>{{#if reason}}<p><strong>Note:</strong> {{reason}}</p>{{/if}}",
      ),
      ft("Thank you for using {{brandName}}!"),
    ),
    textBody: `You Received {{amountDollars}} in Credits

{{amountDollars}} has been added to your account.{{#if reason}}

Note: {{reason}}{{/if}}${CR}`,
  },
  {
    name: "role-changed",
    description: "Sent when a user role is changed",
    subject: "Your role has been updated",
    htmlBody: html(
      "Role Changed",
      hd("Your Role Has Been Updated"),
      p(
        "<p>Your role on the {{brandName}} platform has been updated to <strong>{{newRole}}</strong>.</p><p>Your new permissions are now active.</p>",
      ),
      ft("If you did not expect this change, contact {{supportEmail}}."),
    ),
    textBody: `Your Role Has Been Updated

Your role has been updated to {{newRole}}.${CR}`,
  },
  {
    name: "team-invite",
    description: "Sent when a user is invited to join a tenant",
    subject: "You've been invited to join {{tenantName}}",
    htmlBody: html(
      "Team Invite",
      hd("You've Been Invited to Join {{tenantName}}"),
      p(
        "<p>You've been invited to join <strong>{{tenantName}}</strong> on the {{brandName}} platform.</p><p>Click below to accept the invitation.</p>",
      ),
      `{{#if inviteUrl}}${btn("{{inviteUrl}}", "Accept Invitation")}{{/if}}`,
      ft("If you did not expect this invitation, you can ignore this email."),
    ),
    textBody: `You've Been Invited to Join {{tenantName}}
{{#if inviteUrl}}
Accept: {{inviteUrl}}
{{/if}}${CR}`,
  },
  // -- Agent & Channel ------------------------------------------------------
  {
    name: "agent-created",
    description: "Sent when a new agent is created",
    subject: "Your {{brandName}} {{agentName}} is ready",
    htmlBody: html(
      "Agent Created",
      hd("Your {{brandName}} {{agentName}} Is Ready"),
      p(
        "<p>Your new agent <strong>{{agentName}}</strong> has been created and is ready to use.</p><p>Connect it to a channel to start receiving and sending messages.</p>",
      ),
      ft("Happy building!"),
    ),
    textBody: `Your {{brandName}} {{agentName}} Is Ready

Your new agent has been created and is ready to use.${CR}`,
  },
  {
    name: "channel-connected",
    description: "Sent when a channel is connected to an agent",
    subject: "{{channelName}} connected to {{agentName}}",
    htmlBody: html(
      "Channel Connected",
      hd("{{channelName}} Connected to {{agentName}}"),
      p(
        "<p><strong>{{channelName}}</strong> has been successfully connected to <strong>{{agentName}}</strong>.</p><p>Your agent is now active on this channel.</p>",
      ),
      ft("Your agent is live!"),
    ),
    textBody: `{{channelName}} Connected to {{agentName}}

{{channelName}} has been successfully connected to {{agentName}}.${CR}`,
  },
  {
    name: "channel-disconnected",
    description: "Sent when a channel is disconnected from an agent",
    subject: "{{channelName}} disconnected from {{agentName}}",
    htmlBody: html(
      "Channel Disconnected",
      hd("{{channelName}} Disconnected from {{agentName}}"),
      p(
        "<p><strong>{{channelName}}</strong> has been disconnected from <strong>{{agentName}}</strong>.</p>{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}<p>Reconnect the channel from your dashboard to restore service.</p>",
      ),
      ft("Your agent data is preserved."),
    ),
    textBody: `{{channelName}} Disconnected from {{agentName}}
{{#if reason}}
Reason: {{reason}}

{{/if}}Reconnect from your dashboard to restore service.${CR}`,
  },
  {
    name: "agent-suspended",
    description: "Sent when an agent is paused/suspended",
    subject: "{{agentName}} has been paused",
    htmlBody: html(
      "Agent Paused",
      hd("{{agentName}} Has Been Paused"),
      p(
        "<p>Your agent <strong>{{agentName}}</strong> has been paused.</p>{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}",
      ),
      ft("Contact {{supportEmail}} if you have questions."),
    ),
    textBody: `{{agentName}} Has Been Paused
{{#if reason}}
Reason: {{reason}}
{{/if}}${CR}`,
  },
  // -- Account Deletion ------------------------------------------------------
  {
    name: "account-deletion-requested",
    description: "Sent when a user requests account deletion",
    subject: "Your {{brandName}} account deletion request",
    htmlBody: html(
      "Account Deletion Requested",
      hd("Account Deletion Requested"),
      p(
        "<p>Hi <strong>{{email}}</strong>,</p><p>We've received your request to delete your {{brandName}} account and all associated data.</p><p>Your account will be permanently deleted on <strong>{{deleteAfterDate}}</strong>. Until then, you can cancel this request and keep your account.</p><p>After that date, all your data will be permanently and irreversibly removed, including bots, conversation history, credit records, and plugin configurations.</p>",
      ),
      `{{#if cancelUrl}}${btn("{{cancelUrl}}", "Cancel Deletion", "#22c55e")}{{/if}}`,
      ft("If you did not request this, please contact {{supportEmail}} immediately."),
    ),
    textBody: `Account Deletion Requested

Hi {{email}},

We've received your request to delete your {{brandName}} account and all associated data.

Your account will be permanently deleted on {{deleteAfterDate}}. Until then, you can cancel this request.

After that date, all your data will be permanently and irreversibly removed.
{{#if cancelUrl}}
Cancel deletion: {{cancelUrl}}
{{/if}}
If you did not request this, please contact {{supportEmail}} immediately.${CR}`,
  },
  {
    name: "account-deletion-cancelled",
    description: "Sent when account deletion is cancelled",
    subject: "Your {{brandName}} account deletion has been cancelled",
    htmlBody: html(
      "Account Deletion Cancelled",
      hd("Account Deletion Cancelled"),
      p(
        "<p>Hi <strong>{{email}}</strong>,</p><p>Your account deletion request has been cancelled. Your account and all data remain intact.</p><p>No further action is needed.</p>",
      ),
      ft("If you didn't cancel this, please contact {{supportEmail}}."),
    ),
    textBody: `Account Deletion Cancelled

Hi {{email}},

Your account deletion request has been cancelled. Your account and all data remain intact.

No further action is needed.${CR}`,
  },
  {
    name: "account-deletion-completed",
    description: "Sent after account is permanently deleted",
    subject: "Your {{brandName}} account has been deleted",
    htmlBody: html(
      "Account Deleted",
      hd("Your Account Has Been Deleted"),
      p(
        "<p>Hi <strong>{{email}}</strong>,</p><p>Your {{brandName}} account and all associated data have been permanently deleted as requested.</p><p>This includes all bots, conversation history, credit records, billing data, and plugin configurations.</p><p>If you'd like to use {{brandName}} again in the future, you're welcome to create a new account.</p>",
      ),
      ft("Thank you for using {{brandName}}. We're sorry to see you go."),
    ),
    textBody: `Your Account Has Been Deleted

Hi {{email}},

Your {{brandName}} account and all associated data have been permanently deleted as requested.

This includes all bots, conversation history, credit records, billing data, and plugin configurations.

If you'd like to use {{brandName}} again in the future, you're welcome to create a new account.${CR}`,
  },
  // -- Dividend & Affiliate --------------------------------------------------
  {
    name: "dividend-weekly-digest",
    description: "Weekly summary of dividend payouts",
    subject: "{{brandName}} paid you {{weeklyTotalDollars}} this week",
    htmlBody: html(
      "Weekly Dividend Digest",
      hd("{{brandName}} Paid You {{weeklyTotalDollars}} This Week"),
      p(
        `<p>Here's your weekly dividend summary for <strong>{{weekStartDate}} \u2013 {{weekEndDate}}</strong>.</p>` +
          `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">` +
          `<tr><td style="padding: 8px 0; color: #4a5568;">This week's dividends</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1a1a1a;">{{weeklyTotalDollars}}</td></tr>` +
          `<tr><td style="padding: 8px 0; color: #4a5568;">Days with distributions</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1a1a1a;">{{distributionCount}} of 7</td></tr>` +
          `<tr><td style="padding: 8px 0; color: #4a5568;">Avg. daily pool</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1a1a1a;">{{poolAvgDollars}}</td></tr>` +
          `<tr><td style="padding: 8px 0; color: #4a5568;">Avg. active users</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1a1a1a;">{{activeUsersAvg}}</td></tr>` +
          `<tr style="border-top: 2px solid #e2e8f0;"><td style="padding: 12px 0; color: #4a5568; font-weight: 600;">Lifetime total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; color: #1a1a1a; font-size: 18px;">{{lifetimeTotalDollars}}</td></tr>` +
          `</table>` +
          `{{#if nextDividendDate}}<p style="color: #718096; font-size: 14px;">Next dividend: <strong>{{nextDividendDate}}</strong></p>{{/if}}`,
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "View Your Credits")}{{/if}}`,
      ft("Community dividends are distributed daily from platform revenue. Keep your credits active to stay eligible."),
      '{{#if unsubscribeUrl}}<tr><td style="padding: 0 40px 20px 40px; text-align: center; color: #a0aec0; font-size: 12px;"><a href="{{unsubscribeUrl}}" style="color: #a0aec0; text-decoration: underline;">Unsubscribe from dividend digests</a></td></tr>{{/if}}',
    ),
    textBody: `{{brandName}} Paid You {{weeklyTotalDollars}} This Week

Weekly summary for {{weekStartDate}} \u2013 {{weekEndDate}}:

This week's dividends: {{weeklyTotalDollars}}
Days with distributions: {{distributionCount}} of 7
Avg. daily pool: {{poolAvgDollars}}
Avg. active users: {{activeUsersAvg}}
Lifetime total: {{lifetimeTotalDollars}}

Next dividend: {{nextDividendDate}}

Community dividends are distributed daily from platform revenue.{{#if unsubscribeUrl}}

Unsubscribe: {{unsubscribeUrl}}{{/if}}${CR}`,
  },
  {
    name: "affiliate-credit-match",
    description: "Sent when affiliate earns credits from a referral purchase",
    subject: "You earned {{amountDollars}} in affiliate credits!",
    htmlBody: html(
      "Affiliate Credits Earned",
      hd("You Earned Affiliate Credits!"),
      p(
        "<p>Great news! A user you referred just made their first purchase, and you've been credited <strong>{{amountDollars}}</strong>.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "View Credit Balance")}{{/if}}`,
      ft("Thank you for spreading the word about {{brandName}}!"),
    ),
    textBody: `You Earned Affiliate Credits!

A user you referred just made their first purchase, and you've been credited {{amountDollars}}.
{{#if creditsUrl}}
View your balance: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "spend-alert",
    description: "Sent when monthly spend crosses the configured alert threshold",
    subject: "Spending alert: you've reached your {{alertAtDollars}} threshold",
    htmlBody: html(
      "Spending Alert",
      hd("Spending Alert: Threshold Reached"),
      p(
        "<p>Your monthly spend has reached <strong>{{currentSpendDollars}}</strong>, crossing your alert threshold of <strong>{{alertAtDollars}}</strong>.</p><p>Review your spending to stay within your budget.</p>",
      ),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Review Spending")}{{/if}}`,
      ft("This alert fires once per day when your spend exceeds your configured threshold."),
    ),
    textBody: `Spending Alert: Threshold Reached

Your monthly spend has reached {{currentSpendDollars}}, crossing your alert threshold of {{alertAtDollars}}.
{{#if creditsUrl}}
Review spending: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "custom",
    description: "Admin custom email with arbitrary body text",
    subject: "{{subject}}",
    htmlBody: html(
      "{{subject}}",
      hd("Message from {{brandName}}"),
      p("<p>{{{bodyTextHtml}}}</p>"),
      ft("This is an administrative message from {{brandName}}."),
    ),
    textBody: `{{bodyText}}${CR}`,
  },
  // -- Passthrough templates (billing/auth) ----------------------------------
  {
    name: "low-balance",
    description: "Sent when credit balance drops below threshold",
    subject: "Your {{brandName}} credits are running low",
    htmlBody: html(
      "Low Balance",
      hd("Your {{brandName}} Credits Are Running Low"),
      p("<p>Your balance is <strong>{{balanceDollars}}</strong>. Top up to keep your agents running.</p>"),
      `{{#if creditsUrl}}${btn("{{creditsUrl}}", "Buy Credits")}{{/if}}`,
      ft("This is an automated billing notification."),
    ),
    textBody: `Your {{brandName}} Credits Are Running Low

Balance: {{balanceDollars}}
{{#if creditsUrl}}
Buy credits: {{creditsUrl}}
{{/if}}${CR}`,
  },
  {
    name: "credit-purchase-receipt",
    description: "Sent after a credit purchase is completed",
    subject: "Credits added to your account",
    htmlBody: html(
      "Credits Added",
      hd("Credits Added to Your Account"),
      p(
        "<p><strong>{{amountDollars}}</strong> in credits has been added.</p>{{#if newBalanceDollars}}<p>New balance: <strong>{{newBalanceDollars}}</strong></p>{{/if}}",
      ),
      ft("Thank you for supporting {{brandName}}!"),
    ),
    textBody: `Credits Added

{{amountDollars}} added.${CR}`,
  },
  {
    name: "welcome",
    description: "Sent to new users after registration",
    subject: "Welcome to {{brandName}}",
    htmlBody: html(
      "Welcome",
      hd("Welcome to {{brandName}}!"),
      p("<p>Your account is now active. Start building!</p>"),
      ft("Happy building!"),
    ),
    textBody: `Welcome to {{brandName}}!

Your account is now active.${CR}`,
  },
  {
    name: "password-reset",
    description: "Sent when a user requests a password reset",
    subject: "Reset your {{brandName}} password",
    htmlBody: html(
      "Reset Password",
      hd("Reset Your Password"),
      p("<p>Click below to reset your password.</p>"),
      `{{#if resetUrl}}${btn("{{resetUrl}}", "Reset Password")}{{/if}}`,
      ft("If you did not request this, ignore this email."),
    ),
    textBody: `Reset Your Password
{{#if resetUrl}}
{{resetUrl}}
{{/if}}${CR}`,
  },
  // -- Fleet Updates (new) ---------------------------------------------------
  {
    name: "fleet-update-available",
    description: "Sent when a new fleet update version is available",
    subject: "Fleet update available: {{version}}",
    htmlBody: html(
      "Fleet Update Available",
      hd("Fleet Update Available: {{version}}"),
      p(
        "<p>A new version <strong>{{version}}</strong> is available for your fleet.</p>" +
          '{{#if changelogDate}}<p style="color: #718096; font-size: 14px;">Released: {{changelogDate}}</p>{{/if}}' +
          '{{#if changelogSummary}}<div style="background: #f7fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; color: #4a5568; font-size: 14px; line-height: 22px;">{{changelogSummary}}</div>{{/if}}',
      ),
      `{{#if fleetUrl}}${btn("{{fleetUrl}}", "View Fleet Dashboard")}{{/if}}`,
      ft("Review the changelog and update when ready."),
    ),
    textBody: `Fleet Update Available: {{version}}

A new version {{version}} is available for your fleet.
{{#if changelogDate}}
Released: {{changelogDate}}
{{/if}}{{#if changelogSummary}}
Changelog: {{changelogSummary}}
{{/if}}{{#if fleetUrl}}
Fleet dashboard: {{fleetUrl}}
{{/if}}${CR}`,
  },
  {
    name: "fleet-update-complete",
    description: "Sent after a fleet update rollout completes",
    subject:
      "Fleet updated to {{version}} \u2014 {{#if (eq failed 0)}}all instances healthy{{else}}{{failed}} instance(s) failed{{/if}}",
    htmlBody: html(
      "Fleet Update Complete",
      hd("Fleet Updated to {{version}}"),
      p(
        "<p>Your fleet update to <strong>{{version}}</strong> has completed.</p>" +
          '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">' +
          '<tr><td style="padding: 8px 0; color: #4a5568;">Succeeded</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #22c55e;">{{succeeded}}</td></tr>' +
          '<tr><td style="padding: 8px 0; color: #4a5568;">Failed</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: {{#if (gt failed 0)}}#dc2626{{else}}#22c55e{{/if}};">{{failed}}</td></tr>' +
          '<tr style="border-top: 2px solid #e2e8f0;"><td style="padding: 12px 0; color: #4a5568; font-weight: 600;">Total</td><td style="padding: 12px 0; text-align: right; font-weight: 700; color: #1a1a1a;">{{total}}</td></tr>' +
          "</table>" +
          '{{#if (gt failed 0)}}<p style="color: #dc2626;">Some instances failed to update. Check the fleet dashboard for details.</p>{{/if}}',
      ),
      `{{#if fleetUrl}}${btn("{{fleetUrl}}", "View Fleet Dashboard")}{{/if}}`,
      ft(
        "{{#if (eq failed 0)}}All instances are running the latest version.{{else}}Review failed instances and retry if needed.{{/if}}",
      ),
    ),
    textBody: `Fleet Updated to {{version}}

Your fleet update to {{version}} has completed.

Succeeded: {{succeeded}}
Failed: {{failed}}
Total: {{total}}
{{#if (gt failed 0)}}
Some instances failed to update. Check the fleet dashboard for details.
{{/if}}{{#if fleetUrl}}
Fleet dashboard: {{fleetUrl}}
{{/if}}${CR}`,
  },
];
