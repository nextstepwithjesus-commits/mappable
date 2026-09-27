import { useMemo } from 'preact/hooks';
import { byId, lines } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { P } from '../common.tsx';
import { Sheet } from './Sheet.tsx';

// ---------- синопсис родословий ----------
const GEN = new Set(['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam', 'isaak', 'iakov', 'iuda', 'fares', 'esrom']);
const RUTH = new Set(['fares', 'esrom', 'aram', 'aminadav', 'naasson', 'salmon', 'vooz', 'ovid', 'iessey', 'david']);
const CHR = new Set([
  'adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad', 'sala', 'ever', 'falek', 'ragav', 'serukh', 'nakhor', 'farra', 'avraam', 'isaak', 'iakov',
  'iuda', 'fares', 'esrom', 'aram', 'aminadav', 'naasson', 'salmon', 'vooz', 'ovid', 'iessey', 'david', 'solomon', 'nafan-syn-davida', 'rovoam', 'aviya', 'asa', 'iosafat', 'ioram-syn-iosafata',
  'okhoziya-syn-iorama', 'ioas-syn-okhozii', 'amasiya', 'oziya', 'ioafam', 'akhaz', 'ezekiya', 'manassiya-tsar', 'amon-tsar', 'iosiya', 'ioakim-tsar', 'iekhoniya', 'salafiil', 'fedaiya-syn-iekhonii', 'zorovavel',
]);
export function SynopsisPanel() {
  const rows = useMemo(() => {
    const ids: string[] = [];
    const add = (id: string) => !ids.includes(id) && ids.push(id);
    const j = lines.joseph.persons.map((p) => p.id);
    const m = lines.mary.persons.map((p) => p.id);
    let a = 0;
    let b = 0;
    while (a < j.length || b < m.length) {
      if (a < j.length && b < m.length && j[a] === m[b]) { add(j[a]); a++; b++; continue; }
      // одна линия исчерпана — берём из другой (у недатированных лиц время Infinity, сравнение не продвинет счётчик)
      const takeJ = b >= m.length || (a < j.length && (model.value.chrono.get(j[a])?.b ?? Infinity) <= (model.value.chrono.get(m[b])?.b ?? Infinity));
      if (takeJ) { add(j[a]); a++; } else { add(m[b]); b++; }
      if (j[a - 1] === 'iekhoniya' && !ids.includes('fedaiya-syn-iekhonii')) add('fedaiya-syn-iekhonii');
    }
    return ids;
  }, []);
  const jm = new Map(lines.joseph.persons.map((p) => [p.id, p]));
  const mm = new Map(lines.mary.persons.map((p) => [p.id, p]));
  const cell = (ok: boolean, text: string, cls = '') => <td class={ok ? cls : 'no'}>{ok ? text : '—'}</td>;
  return (
    <Sheet wide title="Синопсис родословий" lead="Родословия рядом: Бытие 5 и 11, Руфь 4, 1 Паралипоменон 1–3, Матфей 1 и Лука 3. Видны пропуски у Матфея, Каинан у Луки, Федаия в 1 Пар 3:19 и то, что Авиуда и Рисая нет среди сыновей Зоровавеля в 1 Пар 3:19–20.">
      <table class="synopsis">
        <thead>
          <tr>
            <th>Лицо</th>
            <th>Быт</th>
            <th>Руф</th>
            <th>1 Пар</th>
            <th>Мф 1</th>
            <th>Лк 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((id) => byId.has(id)).map((id) => {
            const js = jm.get(id);
            const ms = mm.get(id);
            return (
              <tr key={id}>
                <td>
                  <P id={id} />
                </td>
                {id === 'kainan-syn-arfaksada' ? <td>[11:12]</td> : cell(GEN.has(id), '●')}
                {cell(RUTH.has(id), '●')}
                {cell(CHR.has(id), id === 'fedaiya-syn-iekhonii' ? 'отец Зоровавеля, 3:19' : '●')}
                {js?.flag === 'omitted-by-mt' ? <td>опущен</td> : cell(!!js?.mt, js?.mt ? `${js.mt}` : '')}
                {cell(!!ms?.lk, ms?.lk ? `${ms.lk}` : '')}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted">
        Числа в столбцах Мф и Лк — порядковые номера имён: у Матфея от Авраама (1) до Иисуса (42), у Луки от Иосифа (1) до Адама (75). Скобки — чтение в квадратных скобках
        Синодального текста.
      </p>
    </Sheet>
  );
}
