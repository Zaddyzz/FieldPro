// All user-facing text lives here so other languages can be added later
// by supplying another dictionary with the same keys.
const en = {
  'app.name': 'COVARO',
  'app.tagline': 'CONTROL WITH CONFIDENCE.',
  'app.pitch': 'Run every job, customer and technician from one place.',

  'nav.overview': 'Overview', 'nav.jobs': 'Jobs', 'nav.schedule': 'Schedule', 'nav.customers': 'Customers',
  'nav.team': 'Team', 'nav.settings': 'Settings', 'nav.myJobs': 'My jobs', 'nav.more': 'More', 'nav.signOut': 'Sign out',
  'nav.switchBusiness': 'Switch business',

  'common.save': 'Save', 'common.saving': 'Saving…', 'common.cancel': 'Cancel', 'common.edit': 'Edit',
  'common.back': 'Back', 'common.search': 'Search', 'common.loading': 'Loading…', 'common.all': 'All',
  'common.archive': 'Archive', 'common.restore': 'Restore', 'common.archived': 'Archived', 'common.active': 'Active',
  'common.optional': 'optional', 'common.required': 'Required', 'common.copy': 'Copy link', 'common.copied': 'Copied',
  'common.retry': 'Try again', 'common.none': 'None', 'common.add': 'Add', 'common.call': 'Call',

  'auth.signIn': 'Sign in', 'auth.signingIn': 'Signing in…', 'auth.email': 'Email', 'auth.password': 'Password',
  'auth.forgot': 'Forgot password?', 'auth.noAccount': 'New to COVARO?', 'auth.createAccount': 'Create a business account',
  'auth.haveAccount': 'Already have an account?', 'auth.signUpTitle': 'Set up your business',
  'auth.signUpSub': '14-day free trial. No card needed.',
  'auth.businessName': 'Business name', 'auth.ownerName': 'Your full name', 'auth.phone': 'Phone',
  'auth.country': 'Country', 'auth.industry': 'Industry', 'auth.passwordHint': 'At least 10 characters with upper case, lower case and a number',
  'auth.create': 'Create account', 'auth.creating': 'Creating…',
  'auth.checkEmail': 'Check your email', 'auth.checkEmailBody': 'We sent a confirmation link to {email}. Open it to activate your account, then sign in.',
  'auth.resetTitle': 'Reset your password', 'auth.resetSend': 'Send reset link', 'auth.resetSent': 'If an account exists for {email}, a reset link is on its way.',
  'auth.newPassword': 'New password', 'auth.setPassword': 'Set new password', 'auth.passwordUpdated': 'Password updated.',
  'auth.weakPassword': 'Use at least 10 characters with upper case, lower case and a number.',
  'auth.badPhone': 'Enter a valid phone number.',
  'auth.noBusiness': 'Your account is not part of a business yet. Ask your employer for an invite link, or create a business account.',

  'industry.cctv': 'CCTV & security', 'industry.solar': 'Solar & power', 'industry.internet': 'Internet & networking', 'industry.other': 'Other field service',

  'role.owner': 'Owner', 'role.admin': 'Admin', 'role.dispatcher': 'Dispatcher', 'role.technician': 'Technician', 'role.customer': 'Customer',

  'status.new': 'New', 'status.scheduled': 'Scheduled', 'status.assigned': 'Assigned', 'status.in_progress': 'In progress',
  'status.awaiting_parts': 'Awaiting parts', 'status.completed': 'Completed', 'status.cancelled': 'Cancelled', 'status.overdue': 'Overdue',

  'priority.low': 'Low', 'priority.normal': 'Normal', 'priority.high': 'High', 'priority.urgent': 'Urgent',
  'category.installation': 'Installation', 'category.repair': 'Repair', 'category.maintenance': 'Maintenance', 'category.survey': 'Site survey', 'category.other': 'Other',

  'dash.title': 'Overview', 'dash.customers': 'Customers', 'dash.technicians': 'Active technicians', 'dash.openJobs': 'Open jobs',
  'dash.inProgress': 'In progress', 'dash.completedMonth': 'Completed this month', 'dash.overdue': 'Overdue',
  'dash.today': "Today's appointments", 'dash.noToday': 'Nothing booked for today.', 'dash.activity': 'Recent activity',
  'dash.noActivity': 'Activity from your team will show here.', 'dash.trialEnds': 'Trial ends {date}',
  'dash.firstSteps': 'Get started', 'dash.step1': 'Add your first customer', 'dash.step2': 'Invite a technician', 'dash.step3': 'Create a job',

  'jobs.title': 'Jobs', 'jobs.new': 'New job', 'jobs.empty': 'No jobs yet', 'jobs.emptyBody': 'Create a job to schedule work for your team.',
  'jobs.noMatch': 'No jobs match these filters.', 'jobs.list': 'List', 'jobs.day': 'Day', 'jobs.week': 'Week',
  'jobs.customer': 'Customer', 'jobs.titleField': 'Job title', 'jobs.description': 'Description', 'jobs.category': 'Category',
  'jobs.priority': 'Priority', 'jobs.status': 'Status', 'jobs.when': 'Appointment', 'jobs.address': 'Job address',
  'jobs.mapLink': 'Map link', 'jobs.mapLinkHint': 'Paste a Google Maps or other https:// link', 'jobs.technicians': 'Technicians',
  'jobs.internalNotes': 'Internal notes', 'jobs.internalHint': 'Visible to your team, never to customers',
  'jobs.unassigned': 'Unassigned', 'jobs.anyTech': 'Any technician', 'jobs.create': 'Create job', 'jobs.saveChanges': 'Save changes',
  'jobs.activity': 'Activity', 'jobs.photos': 'Photos', 'jobs.materials': 'Materials used', 'jobs.workDone': 'Work done',
  'jobs.addNote': 'Add a note', 'jobs.noteSaved': 'Note added', 'jobs.addPhoto': 'Add photo', 'jobs.uploading': 'Uploading…',
  'jobs.item': 'Item', 'jobs.qty': 'Qty', 'jobs.noPhotos': 'No photos yet.', 'jobs.noMaterials': 'No materials recorded.',
  'jobs.openMaps': 'Open in Maps', 'jobs.submitCompletion': 'Submit completion', 'jobs.completeTitle': 'Complete this job',
  'jobs.workDoneHint': 'What did you do? This goes on the job record.', 'jobs.closed': 'This job is closed.',
  'jobs.archiveConfirm': 'Archive this job? It will be hidden from lists but kept on record.',
  'jobs.pickCustomer': 'Choose a customer', 'jobs.noCustomers': 'Add a customer first.', 'jobs.notFound': 'Job not found, or you do not have access to it.',
  'jobs.assignedTo': 'Assigned to', 'jobs.setStatus': 'Update status', 'jobs.timesIn': 'Times shown in {tz}',

  'act.created': 'created the job', 'act.status': 'changed status', 'act.completion': 'completed the job',
  'act.assigned': 'assigned', 'act.unassigned': 'unassigned', 'act.note': 'added a note', 'act.photo': 'added a photo',
  'act.material': 'recorded material', 'act.updated': 'rescheduled', 'act.someone': 'Someone',

  'cust.title': 'Customers', 'cust.new': 'New customer', 'cust.empty': 'No customers yet', 'cust.emptyBody': 'Add the people and companies you work for.',
  'cust.noMatch': 'No customers match.', 'cust.searchHint': 'Name or phone', 'cust.kind': 'Type', 'cust.individual': 'Individual',
  'cust.company': 'Company', 'cust.name': 'Name', 'cust.companyName': 'Company name', 'cust.contact': 'Contact person',
  'cust.phone': 'Phone', 'cust.email': 'Email', 'cust.address1': 'Address', 'cust.address2': 'Address line 2',
  'cust.city': 'City / town', 'cust.region': 'State / region', 'cust.postal': 'Postal code', 'cust.notes': 'Notes',
  'cust.create': 'Save customer', 'cust.jobs': 'Jobs', 'cust.equipment': 'Equipment', 'cust.invoices': 'Invoices',
  'cust.phase2': 'Arrives in the next release.', 'cust.noJobs': 'No jobs for this customer yet.', 'cust.newJob': 'New job for this customer',
  'cust.archiveConfirm': 'Archive this customer? Their history is kept.', 'cust.area': 'City / town',

  'team.title': 'Team', 'team.invite': 'Invite team member', 'team.inviteSub': 'They sign up with this email, then open the link to join.',
  'team.role': 'Role', 'team.sendInvite': 'Create invite', 'team.pending': 'Pending invites', 'team.members': 'Members',
  'team.shareEmail': 'Send by email', 'team.shareWhatsApp': 'Send on WhatsApp', 'team.revoke': 'Revoke',
  'team.expires': 'Expires {date}', 'team.deactivate': 'Deactivate', 'team.reactivate': 'Reactivate', 'team.deactivated': 'Deactivated',
  'team.you': 'You', 'team.serviceArea': 'Service area', 'team.skills': 'Skills', 'team.inviteMessage': 'You have been invited to join {business} on COVARO as {role}. Sign up with {email}, then open this link: {link}',
  'team.inviteSubject': 'Join {business} on COVARO', 'team.noInvites': 'No pending invites.',
  'team.deactivateConfirm': 'Remove this person’s access to this business? Their past work stays on record.',

  'invite.title': 'Join a business', 'invite.body': '{business} invited {email} to join as {role}.',
  'invite.accept': 'Accept invite', 'invite.signInFirst': 'Sign in or create an account with {email} to accept.',
  'invite.expired': 'This invite has expired. Ask for a new one.', 'invite.used': 'This invite has already been used.',
  'invite.invalid': 'This invite link is not valid.', 'invite.signUp': 'Create account',

  'settings.title': 'Settings', 'settings.business': 'Business', 'settings.regional': 'Regional', 'settings.jobs': 'Jobs',
  'settings.currency': 'Currency', 'settings.timeZone': 'Time zone', 'settings.dateFormat': 'Date format', 'settings.taxLabel': 'Tax name',
  'settings.jobPrefix': 'Job number prefix', 'settings.whatsapp': 'Show WhatsApp buttons', 'settings.whatsappHint': 'Opens WhatsApp with a prefilled message. Free; no WhatsApp API.',
  'settings.saved': 'Settings saved', 'settings.profile': 'Your profile', 'settings.ownerOnly': 'Only the owner or an admin can change business settings.',

  'tech.today': 'Today', 'tech.upcoming': 'Upcoming', 'tech.overdue': 'Overdue', 'tech.done': 'Recently completed',
  'tech.empty': 'No jobs assigned to you right now.', 'tech.start': 'Start job', 'tech.parts': 'Awaiting parts', 'tech.resume': 'Resume',

  'setup.title': 'Quick setup', 'setup.sub': 'Four short steps. You can change any of this later in Settings.',
  'setup.step': 'Step {n} of {total}', 'setup.next': 'Save and continue', 'setup.back': 'Back', 'setup.skip': 'Skip for now',
  'setup.finish': 'Finish setup', 'setup.skipAll': 'Set up later',
  'setup.s1': 'Your business', 'setup.s1Sub': 'This shows on job records and, later, on quotes and invoices.',
  'setup.s2': 'Region and tax', 'setup.s2Sub': 'Prices use this currency. Appointment times use this time zone for everyone on your team.',
  'setup.s3': 'Jobs', 'setup.s3Sub': 'Every job gets a number. Pick the prefix you want customers to see.',
  'setup.s4': 'Your team', 'setup.s4Sub': 'Invite the people who will take jobs. Each gets a link to join.',
  'setup.inviteAdd': 'Add invite', 'setup.invited': 'Invite created for {email}. Share its link from the Team page.',
  'setup.noInvites': 'No invites yet. You can also do this later from Team.',
  'setup.done': 'Setup complete', 'setup.open': 'Run quick setup again', 'setup.example': 'Your first job will be {ref}',
  'theme.title': 'Appearance', 'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.system': 'Match device',
  'theme.toggle': 'Switch light or dark mode', 'theme.hint': 'Saved on this device only.',
  'pager.showing': '{from}–{to} of {total}', 'pager.prev': 'Previous', 'pager.next': 'Next',
  'error.generic': 'Something went wrong.', 'error.notConfigured': 'COVARO is not connected to its database yet.',
  'error.forbidden': 'You do not have access to this page.',
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
