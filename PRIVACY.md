# EpiCast Privacy Policy

**Last updated: February 24, 2026**

## Overview

EpiCast is an AI-powered syndromic surveillance application designed for community health workers. We are committed to protecting user privacy and patient data.

## Data Processing

**On-Device Processing:** Clinical narratives are processed entirely on your device using MedGemma 4B. Raw patient narratives never leave your phone. Only structured, de-identified syndromic signals are transmitted when internet connectivity is available.

**Cloud Processing:** When you use cloud-connected features (situation reports, cough audio analysis), data is sent to secure servers for processing. Audio recordings are processed and immediately discarded — they are not stored.

## Data Collection

EpiCast collects the following data only when you explicitly submit an encounter:

- Structured syndromic signals (syndrome category, severity, age group)
- District and facility location (no GPS coordinates of patients)
- Timestamps

EpiCast does **not** collect:

- Patient names, addresses, or identifying information
- Raw clinical narratives (processed on-device only)
- Device identifiers for tracking purposes
- Usage analytics or advertising data

## Data Storage

Syndromic signals are stored in a secure, encrypted database (Supabase) for aggregation into surveillance dashboards. Data is accessible only to authorized health officers within the relevant district.

## Third-Party Services

- **Google Health AI Developer Foundations models** — on-device inference, no data transmitted
- **Supabase** — encrypted database for syndromic signal storage
- **Cloud inference endpoints** — situation report generation and cough classification only

## Your Rights

You may request deletion of any submitted encounter data by contacting us. All data associated with your account will be removed within 30 days.

## Children's Privacy

EpiCast is not intended for use by individuals under 18. We do not knowingly collect data from children.

## Changes

We may update this policy from time to time. Changes will be posted to this page with an updated date.

## Contact

For privacy questions or data deletion requests:
- GitHub Issues: [github.com/Janeodum/epicast/issues](https://github.com/Janeodum/epicast/issues)
- Email: jane.odum@uga.edu