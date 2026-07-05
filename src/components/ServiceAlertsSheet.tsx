'use client';

import type { ParsedAlert } from '@/app/api/alerts/route';
import type { LineInfo } from '@/lib/lines';
import type { LineStatus } from '@/lib/line-status';
import { useLanguage, lineDisplayName } from '@/i18n';
import { ArrowRightIcon, CheckCircleIcon, MinorDelaysIcon, NoServiceIcon } from '@/components/icons';

// ── Service Alerts Sheet ─────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: ParsedAlert }) {
  const { t } = useLanguage();
  const isDelay = alert.title.toLowerCase().includes('delay');
  const isCancel = alert.title.toLowerCase().includes('cancel');
  const borderColor = isCancel ? 'border-red-500' : isDelay ? 'border-amber-500' : 'border-blue-400';
  const iconBg = isCancel ? 'bg-red-100 text-red-600' : isDelay ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600';

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-4 mb-3`}>
      {/* Title */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${iconBg}`}>
          {isCancel ? '✕' : '!'}
        </span>
        <span className="font-semibold text-gray-900 text-sm leading-snug">{alert.title}</span>
      </div>

      {/* Route */}
      {(alert.fromStation || alert.toStation) && (
        <div className="flex items-center gap-1 text-sm text-gray-700 mb-1.5 ml-7">
          <span className="font-medium text-gray-800">{alert.fromStation}</span>
          <ArrowRightIcon className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-800">{alert.toStation}</span>
          {alert.direction !== 'both' && (
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border border-gray-300 rounded px-1 py-0.5">
              {alert.direction === 'northbound' ? '↑ NB' : '↓ SB'}
            </span>
          )}
        </div>
      )}

      {/* Schedule */}
      {alert.scheduledDeparture && (
        <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5 ml-7">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {t('scheduled')}{' '}
            <span className="font-mono font-semibold text-gray-800">{alert.scheduledDeparture}</span>
            {alert.scheduledArrival && (
              <>
                {' – '}
                <span className="font-mono font-semibold text-gray-800">{alert.scheduledArrival}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Status */}
      {alert.status && (
        <div className="flex items-center gap-1.5 text-sm mb-1.5 ml-7">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              alert.status.toLowerCase() === 'stopped' ? 'bg-red-500' :
              alert.status.toLowerCase() === 'moving' ? 'bg-green-500' : 'bg-amber-500'
            }`}
          />
          <span className="text-gray-600">
            {t('status')}: <span className="font-medium text-gray-800">{alert.status}</span>
          </span>
        </div>
      )}

      {/* Reason */}
      {alert.reason && (
        <div className="text-sm text-gray-500 ml-7 leading-relaxed">
          <span className="text-gray-400">{t('reason')} </span>{alert.reason}
        </div>
      )}
    </div>
  );
}

export default function ServiceAlertsSheet({
  line,
  alerts,
  loading,
  available,
  lastUpdated,
  status,
  onClose,
}: {
  line: LineInfo;
  alerts: ParsedAlert[];
  loading: boolean;
  available: boolean;
  lastUpdated: string | null;
  status: LineStatus;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
    : null;
  const lineName = lineDisplayName(line, lang);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md flex flex-col bg-gray-50 rounded-t-2xl max-h-[90vh]"
        style={{ boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/40 rounded-full" />

        {/* Sheet header — GO dark green, matching app header */}
        <div className="bg-go-dark text-white px-4 pt-6 pb-4 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            {/* Line badge */}
            <div
              className="w-11 h-11 rounded-xl flex flex-col items-center justify-center font-extrabold text-white shrink-0"
              style={{ backgroundColor: line.color }}
            >
              <span className="text-xs leading-none">{line.id}</span>
            </div>
            <div>
              <div className="font-bold text-base leading-tight">{t('lineOption', { name: lineName })}</div>
              <div className="text-white/60 text-xs">{t('serviceUpdatesTitle')}</div>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pt-4 pb-2">
          {loading ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-go-green border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">{t('loadingServiceUpdates')}</span>
            </div>
          ) : !available ? (
            /* API unavailable */
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 text-center">
              <div className="text-gray-400 text-2xl mb-2">📡</div>
              <div className="text-sm font-medium text-gray-700 mb-1">{t('liveDataUnavailable')}</div>
              <div className="text-xs text-gray-500">{t('checkOfficialSite')}</div>
            </div>
          ) : (
            <>
              {status === 'noService' ? (
                /* No scheduled service today */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <NoServiceIcon className="w-8 h-8 shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('noScheduledServiceToday')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t('noScheduledServiceDesc', { name: lineName })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : status === 'minor' ? (
                /* Minor delays */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <MinorDelaysIcon className="w-8 h-8 shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('minorDelays')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t('minorDelaysDesc', { name: lineName })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : alerts.length === 0 ? (
                /* Good service */
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <CheckCircleIcon className="w-8 h-8 text-go-green shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900">{t('goodService')}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{t('noActiveAlerts', { name: lineName })}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Alert cards — shown alongside the status block above when present */}
              {alerts.map((alert, i) => <AlertCard key={i} alert={alert} />)}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pt-3 pb-6 border-t border-gray-200 bg-white rounded-none shrink-0">
          <a
            href={`https://www.gotransit.com/en/service-updates?mode=t&code=${line.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-go-green text-white font-semibold py-3 rounded-xl text-sm"
          >
            {t('viewOnGotransit')}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          {formattedTime && (
            <div className="text-center text-xs text-gray-400 mt-2">
              {t('lastUpdated', { time: formattedTime })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
