# IndiaMET visitor pass delivery and CMS sync

The pass API synchronizes registrations with the authenticated syncVisitorPass CMS mutation. The pass-registration list is not populated by generic createLead submissions.

## IndiaMET backend (Render)

- CMS_GRAPHQL_ENDPOINT: deployed CMS backend GraphQL URL (for example https://business-cms-1aks.onrender.com/graphql).
- CMS_PROJECT_ID: the IndiaMET Project ID from CMS, not the project name or a Vercel project ID.
- CMS_SYNC_SECRET: a private secret shared with the CMS backend.
- FRONTEND_URL: https://www.indiametexpo.com.
- PUBLIC_BACKEND_URL: the public HTTPS IndiaMET API origin, without /api.

Set CMS_PROJECT_ID explicitly on the IndiaMET backend; it intentionally does not fall back to NEXT_PUBLIC_CMS_PROJECT_ID. The backend sends CMS_PROJECT_ID in the mutation and x-project-id header. A durable queue retries failures and backfills existing passes.

## CMS backend (Render)

Set the same CMS_SYNC_SECRET on the CMS backend. Deploy the visitor-pass schema and apply the existing migration with npx prisma migrate deploy. Keep this secret out of NEXT_PUBLIC variables.

## CMS project setup

One CMS Vercel deployment supports both DIEMEX and IndiaMET. Create an IndiaMET project record if it is missing and select it in the CMS project switcher. Give each event backend its own CMS_PROJECT_ID; no additional CMS Vercel project is needed.

## WhatsApp (IndiaMET backend)

Twilio Verify OTPs and visitor-pass messages use separate configuration. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and TWILIO_VERIFY_SERVICE_SID. For pass messages set TWILIO_WHATSAPP_PASS_CONTENT_SID to an approved IndiaMET Content SID (HX...). Do not use a DIEMEX-branded template.

Set TWILIO_WHATSAPP_PASS_VARIABLES to match the approved template. Default: {"1":"name","2":"registrationNumber","3":"passUrl"}. For a Cloudinary media header, use {"1":"name","2":"registrationNumber","3":"mediaPath"} and configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.

Twilio pass delivery requires an approved Content template; free-form Body/MediaUrl delivery is not reliable for a business-initiated message after OTP. Missing template configuration is returned as a delivery error and can be retried from the success page.

The IndiaMET admin pass-registration API reports sync attempts, next retry time, and last error. Existing records are backfilled automatically.
