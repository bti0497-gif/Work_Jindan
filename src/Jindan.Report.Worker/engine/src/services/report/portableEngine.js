// Stable public entry point. Internal reportEngine.js remains the existing DTO
// and validation implementation; this file wraps, rather than replaces, it.
export {createReportEngine,ReportEngineError,ENGINE_CONTRACT_VERSION,ENGINE_ANALYSIS_LIMIT} from './engineFacade.js';
export {createEngineRecovery,readEngineRecovery,RECOVERY_SCHEMA,RECOVERY_LIMIT} from './engineRecovery.js';
export {auditNativeSave} from './nativeSaveAudit.js';
