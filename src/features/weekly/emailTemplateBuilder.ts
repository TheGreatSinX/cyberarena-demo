import { WeeklyEmailTemplate, WeeklyQuestion, WeeklyQuestionnaire, WeeklySubmission } from '../../types/weekly';
import csamThemeBgUrl from '../../assets/images/csam_2026_theme_bg_1791285987388.jpg';

export const DEFAULT_EMAIL_BACKGROUND_URL = csamThemeBgUrl;

export const DEFAULT_WEEKLY_EMAIL_TEMPLATE: WeeklyEmailTemplate = {
  subject: '[Action Required] {{week_label}}: {{questionnaire_title}} | CYBER|ARENA Security Awareness',
  bannerSubtitle: 'CYBER|ARENA • WEEKLY SECURITY AWARENESS PROGRAM',
  heading: '{{questionnaire_title}}',
  greeting: 'Hello {{recipient_name}},',
  introParagraph:
    'As part of our ongoing cybersecurity resilience program, please complete this week’s short Security Awareness Questionnaire ({{week_label}}). Your participation helps safeguard our organization against phishing, credential compromise, and emerging cyber threats.',
  ctaButtonText: 'Start Weekly Security Questionnaire',
  securityTipBox:
    'Security Reminder: Always verify sender domains and never share your Multi-Factor Authentication (MFA) codes with anyone.',
  footerText:
    'Sent by the CYBER|ARENA Information Security Team • Please complete before {{due_date}}.',
  accentColor: '#F05A28',
  backgroundImageUrl: csamThemeBgUrl,
  customHtmlOverride: null,
};

export const SAMPLE_WEEKLY_QUESTIONS: WeeklyQuestion[] = [];

export interface EmailTemplateVariables {
  recipient_name: string;
  recipient_email: string;
  department: string;
  questionnaire_title: string;
  week_label: string;
  due_date: string;
  questionnaire_link: string;
  question_count: string;
  passing_score: string;
}

export function interpolateTemplate(text: string, vars: EmailTemplateVariables): string {
  if (!text) return '';
  return text
    .replace(/\{\{\s*recipient_name\s*\}\}/gi, vars.recipient_name)
    .replace(/\{\{\s*name\s*\}\}/gi, vars.recipient_name)
    .replace(/\{\{\s*recipient_email\s*\}\}/gi, vars.recipient_email)
    .replace(/\{\{\s*email\s*\}\}/gi, vars.recipient_email)
    .replace(/\{\{\s*department\s*\}\}/gi, vars.department)
    .replace(/\{\{\s*questionnaire_title\s*\}\}/gi, vars.questionnaire_title)
    .replace(/\{\{\s*title\s*\}\}/gi, vars.questionnaire_title)
    .replace(/\{\{\s*week_label\s*\}\}/gi, vars.week_label)
    .replace(/\{\{\s*due_date\s*\}\}/gi, vars.due_date)
    .replace(/\{\{\s*questionnaire_link\s*\}\}/gi, vars.questionnaire_link)
    .replace(/\{\{\s*link\s*\}\}/gi, vars.questionnaire_link)
    .replace(/\{\{\s*question_count\s*\}\}/gi, vars.question_count)
    .replace(/\{\{\s*passing_score\s*\}\}/gi, vars.passing_score);
}

export function buildWeeklyQuestionnaireUrl(questionnaireId: string, token?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams();
  params.set('weekly', questionnaireId);
  if (token) {
    params.set('token', token);
  }
  return `${origin}/?${params.toString()}`;
}

export function resolveAbsoluteAssetUrl(urlOrPath?: string | null): string {
  const raw = urlOrPath || '/csam-2026-bg.jpg';
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }
  return raw;
}

export function generateWeeklyEmailHtml(
  template: WeeklyEmailTemplate,
  vars: EmailTemplateVariables
): string {
  if (template.customHtmlOverride && template.customHtmlOverride.trim().length > 0) {
    return interpolateTemplate(template.customHtmlOverride, vars);
  }

  const accent = template.accentColor || '#F05A28';
  const bgUrl = resolveAbsoluteAssetUrl(template.backgroundImageUrl || csamThemeBgUrl);
  const bannerSubtitle = interpolateTemplate(template.bannerSubtitle, vars);
  const heading = interpolateTemplate(template.heading, vars);
  const greeting = interpolateTemplate(template.greeting, vars);
  const introParagraph = interpolateTemplate(template.introParagraph, vars);
  const ctaText = interpolateTemplate(template.ctaButtonText, vars);
  const tipBox = interpolateTemplate(template.securityTipBox, vars);
  const footerText = interpolateTemplate(template.footerText, vars);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#071326;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="width:100%;background-color:#071326;background-image:url('${bgUrl}');background-size:cover;background-position:center center;background-repeat:no-repeat;margin:0;padding:0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" background="${bgUrl}" style="width:100%;background-color:#071326;background-image:url('${bgUrl}');background-size:cover;background-position:center center;background-repeat:no-repeat;padding:40px 16px;">
      <tr>
        <td align="center" background="${bgUrl}" style="background-image:url('${bgUrl}');background-size:cover;background-position:center center;background-repeat:no-repeat;padding:8px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" background="${bgUrl}" style="max-width:600px;width:100%;background-color:#0D1F3C;background-image:url('${bgUrl}');background-size:cover;background-position:center center;border:2px solid #00A191;border-radius:20px;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,0.65);">
            <!-- Top Accent Bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg, ${accent} 0%, #00A191 100%);background-color:${accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <!-- Header with CSAM 2026 Theme Banner -->
            <tr>
              <td background="${bgUrl}" style="padding:28px 32px 22px 32px;background-color:#0D1F3C;background-image:url('${bgUrl}');background-size:cover;background-position:center top;border-bottom:1px solid rgba(0,161,145,0.45);">
                <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#20d8c4;margin-bottom:8px;text-shadow:0 1px 4px rgba(0,0,0,0.85);">
                  ${bannerSubtitle}
                </div>
                <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.4px;text-shadow:0 2px 8px rgba(0,0,0,0.85);">
                  CYBER<span style="color:${accent};">|</span>ARENA
                </div>
              </td>
            </tr>

            <!-- Main Body -->
            <tr>
              <td style="padding:28px 32px;background-color:rgba(8,20,40,0.84);">
                <div style="display:inline-block;padding:4px 12px;border-radius:999px;background-color:rgba(240,90,40,0.2);border:1px solid ${accent};color:${accent};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px;">
                  ${vars.week_label} • Due: ${vars.due_date}
                </div>

                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.35;font-weight:800;color:#ffffff;">
                  ${heading}
                </h1>

                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#e2e8f0;font-weight:600;">
                  ${greeting}
                </p>

                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#cbd5e1;">
                  ${introParagraph}
                </p>

                <!-- Metadata Summary Box -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:rgba(7,18,36,0.92);border:1px solid rgba(0,161,145,0.45);border-radius:12px;margin-bottom:26px;">
                  <tr>
                    <td style="padding:14px 18px;font-size:12px;color:#cbd5e1;">
                      <strong style="color:#ffffff;display:block;margin-bottom:2px;">Assigned To</strong>
                      ${vars.recipient_name} (${vars.recipient_email})
                    </td>
                    <td style="padding:14px 18px;font-size:12px;color:#cbd5e1;text-align:right;">
                      <strong style="color:#20d8c4;display:block;margin-bottom:2px;">Assessment Info</strong>
                      ${vars.question_count} Questions • Pass: ${vars.passing_score}%
                    </td>
                  </tr>
                </table>

                <!-- CTA Button -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 26px auto;">
                  <tr>
                    <td align="center" style="border-radius:12px;background-color:${accent};box-shadow:0 8px 20px rgba(240,90,40,0.35);">
                      <a href="${vars.questionnaire_link}" target="_blank" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">
                        ${ctaText} &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Security Tip Callout -->
                <div style="padding:14px 16px;background-color:rgba(0,161,145,0.16);border-left:4px solid #00A191;border-radius:8px;font-size:12px;line-height:1.55;color:#e2e8f0;">
                  ${tipBox}
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:18px 32px;background-color:rgba(6,15,30,0.94);border-top:1px solid rgba(229,229,229,0.12);font-size:11px;color:#94a3b8;text-align:center;">
                ${footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export function exportWeeklySubmissionsToCsv(
  questionnaire: WeeklyQuestionnaire | null,
  submissions: WeeklySubmission[]
): void {
  const maxQuestions = questionnaire?.questions?.length || 10;
  const questionHeaders: string[] = [];
  for (let i = 1; i <= maxQuestions; i++) {
    questionHeaders.push(`Q${i} Prompt`, `Q${i} User Answer`, `Q${i} Correct?`);
  }

  const headers = [
    'Submission ID',
    'Week Label',
    'Questionnaire Title',
    'Recipient Name',
    'Recipient Email',
    'Department',
    'Score',
    'Max Score',
    'Correct Answers',
    'Total Questions',
    'Accuracy (%)',
    'Status (Pass/Fail)',
    'Submitted At',
    ...questionHeaders,
  ];

  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = submissions.map((s) => {
    const qCols: string[] = [];
    for (let i = 0; i < maxQuestions; i++) {
      const ans = s.answers?.[i];
      if (ans) {
        qCols.push(
          escapeCsv(ans.questionText),
          escapeCsv(ans.selectedOptionText),
          escapeCsv(ans.isCorrect ? 'CORRECT' : 'INCORRECT')
        );
      } else {
        qCols.push('""', '""', '""');
      }
    }

    return [
      escapeCsv(s.id),
      escapeCsv(s.weekLabel),
      escapeCsv(s.questionnaireTitle),
      escapeCsv(s.recipientName),
      escapeCsv(s.recipientEmail),
      escapeCsv(s.department || 'General'),
      s.score,
      s.maxScore,
      s.correctCount,
      s.totalQuestions,
      `${s.accuracy}%`,
      escapeCsv(s.passed ? 'PASSED' : 'NEEDS REVIEW'),
      escapeCsv(s.submittedAt),
      ...qCols,
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const titleSlug = questionnaire
    ? questionnaire.title.replace(/[^a-zA-Z0-9_-]+/g, '_')
    : 'All_Campaigns';
  link.setAttribute('href', url);
  link.setAttribute('download', `CYBER_ARENA_Weekly_Awareness_${titleSlug}_Results.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
