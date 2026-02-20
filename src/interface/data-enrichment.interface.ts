enum ScheduleStatus {
  ACTIVE = 'active',
  INACTIVE = 'in-active',
}

enum IngestMode {
  APPEND = 'append',
  REPLACE = 'replace',
}

enum ConfigType {
  PUSH = 'push',
  PULL = 'pull',
}

enum FileType {
  CSV = 'CSV',
  JSON = 'JSON',
  TSV = 'TSV',
}

enum SourceType {
  SFTP = 'SFTP',
  HTTP = 'HTTP',
}

enum AuthType {
  USERNAME_PASSWORD = 'USERNAME_PASSWORD',
  PRIVATE_KEY = 'PRIVATE_KEY',
}

enum JobStatus {
  INPROGRESS = 'STATUS_01_IN_PROGRESS',
  ON_HOLD = 'STATUS_02_ON_HOLD',
  REVIEW = 'STATUS_03_UNDER_REVIEW',
  APPROVED = 'STATUS_04_APPROVED',
  REJECTED = 'STATUS_05_REJECTED',
  EXPORTED = 'STATUS_06_EXPORTED',
  READY = 'STATUS_07_READY_FOR_DEPLOYMENT',
  DEPLOYED = 'STATUS_08_DEPLOYED',
}

interface ISuccess {
  success: boolean;
  message: string;
}

interface Schedule {
  id: string;
  tenant_id: string;
  name: string;
  cron: string;
  iterations: number;
  status: JobStatus;
  comments: string | null;
}

interface HTTPConnection {
  url: string;
  headers: Record<string, string>;
}

interface SFTPConnection {
  host: string;
  port: number;
  auth_type?: AuthType;
  user_name: string;
  password?: string;
  private_key?: string;
}

type FileSettings =
  | { file_type: FileType.CSV; delimiter?: string; header?: boolean | string[]; path: string }
  | { file_type: FileType.TSV; header?: boolean | string[]; path: string }
  | { file_type: FileType.JSON; path: string };

interface Job {
  id: string;
  tenant_id: string;
  endpoint_name: string;
  path: string;
  source_type?: SourceType;
  description: string | null;
  connection?: HTTPConnection | SFTPConnection;
  file?: FileSettings;
  table_name: string;
  mode: IngestMode;
  version: string;
  status: JobStatus;
  publishing_status: string | null;
  record_status?: ScheduleStatus;
  schedule_id?: string;
  cron?: string;
  iterations?: number;
  created_at: Date;
  type: 'push' | 'pull';
}
interface JobSummary {
  id: string;
  endpoint_name: string;
  path: string | null;
  mode: IngestMode;
  table_name: string;
  description: string | null;
  version: string;
  status: JobStatus;
  publishing_status: string | null;
  created_at: Date;
  type: 'push' | 'pull';
}

interface Enrichment {
  id?: number;
  job_id: string;
  checksum: string;
  data: Record<string, unknown>;
}

interface CronJob {
  id: string;
  tenant_id: string;
  name: string;
  cron: string;
  iterations: number;
  status: JobStatus;
  comments: string | null;
}

interface PushJob {
  id: string;
  tenant_id: string;
  endpoint_name: string;
  path: string;
  mode: IngestMode;
  table_name: string;
  description: string;
  version: string;
  status: JobStatus;
  publishing_status: ScheduleStatus;
  comments?: string;
  created_at: Date;
  updated_at: Date;
}

interface PullJobHistory {
  id: number;
  job_id: string;
  counts: number;
  processed_counts: number;
  exception: string | null;
  created_at: Date;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  pages?: number;
}

export {
  ScheduleStatus,
  IngestMode,
  SourceType,
  JobStatus,
  FileType,
  AuthType,
  ConfigType,
  type ISuccess,
  type Schedule,
  type PushJob,
  type Enrichment,
  type FileSettings,
  type HTTPConnection,
  type Job,
  type CronJob,
  type SFTPConnection,
  type JobSummary,
  type PullJobHistory,
  type PaginatedResult,
};
