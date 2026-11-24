export const PERMISSIONS = {
  sectorsList: 'sectors.list',
  sectorsRead: 'sectors.read',
  sectorsCreate: 'sectors.create',
  sectorsUpdate: 'sectors.update',
  sectorsChangeStatus: 'sectors.change_status',
  sectorsHospitalScope: 'sectors.scope.hospital',
  usersRead: 'users.read.hospital', usersCreate: 'users.create.hospital', usersUpdate: 'users.update.hospital',
  usersDeactivate: 'users.deactivate.hospital', usersChangeProfile: 'users.change_profile.hospital',
  teamsReadHospital: 'teams.read.hospital', teamsCreateHospital: 'teams.create.hospital', teamsUpdateHospital: 'teams.update.hospital', teamsDeactivateHospital: 'teams.deactivate.hospital',
  shiftsReadHospital: 'shifts.read.hospital', shiftsCreateHospital: 'shifts.create.hospital', shiftsUpdateHospital: 'shifts.update.hospital', shiftsDeactivateHospital: 'shifts.deactivate.hospital',
  schedulesReadHospital: 'schedules.read.hospital', schedulesCreateHospital: 'schedules.create.hospital', schedulesUpdateHospital: 'schedules.update.hospital', schedulesCancelHospital: 'schedules.cancel.hospital',
  questionsReadHospital: 'questions.read.hospital', questionsCreateHospital: 'questions.create.hospital', questionsUpdateHospital: 'questions.update.hospital', questionsDeactivateHospital: 'questions.deactivate.hospital',
  questionsReadAssigned: 'questions.read.assigned', questionsCreateAssigned: 'questions.create.assigned', questionsUpdateAssigned: 'questions.update.assigned', questionsDeactivateAssigned: 'questions.deactivate.assigned',
  surveySettingsManage: 'surveys.settings.manage.hospital', indicatorsReadHospital: 'surveys.indicators.read.hospital', indicatorsReadAssigned: 'surveys.indicators.read.assigned',
  manifestationsRead: 'manifestations.read.hospital', manifestationsClassify: 'manifestations.classify.hospital',
  manifestationsUpdateStatus: 'manifestations.update_status.hospital', manifestationsLogAttempt: 'manifestations.log_attempt.hospital',
  manifestationsComplete: 'manifestations.complete.hospital',
  auditReadHospital: 'audit.read.hospital', auditReadManifestations: 'audit.read.manifestations',
} as const;

export type SectorScope = 'hospital' | 'assigned';
