import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

// security-agent.js는 "각 하위 시스템의 </body> 직전"에 <script>로 삽입되는
// 스크립트다 — 페이지에 다른 스크립트(광고, 위젯, 혹은 XSS로 주입된 코드)가
// 같이 떠 있다면 window.KSecAgent도 그 스크립트들과 같은 전역 공간을 공유한다.
// 이 테스트는 "정상적인 K-Security 서버 채널을 거치지 않고, 같은 페이지의
// 아무 스크립트나 window.KSecAgent.executeCommand()를 직접 호출해도 서비스
// 전체를 중단(SUSPEND)시킬 수 있는가"를 검증한다.

describe('security-agent.js — window.KSecAgent.executeCommand 인증 여부', () => {
  let dom;

  before(() => {
    dom = new JSDOM(`
      <!doctype html><html><body>
        <input id="a"><button id="b">클릭</button><textarea id="c"></textarea>
        <script id="ksec-agent" data-svc="school" data-url="school.hondi.net"></script>
      </body></html>
    `, { runScripts: 'outside-only', url: 'https://school.hondi.net/' });

    // report()가 24시간짜리 setInterval을 실제로 거는데, 테스트 프로세스가
    // 이 타이머 때문에 안 끝나는 걸 막기 위해 무해한 스텁으로 교체.
    dom.window.setInterval = () => 0;
    dom.window.clearInterval = () => {};
    dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });

    const code = fs.readFileSync(new URL('../security-agent.js', import.meta.url), 'utf-8');
    dom.window.eval(code);
  });

  after(() => { dom.window.close(); });

  test('COMMAND_URL이 비활성(null)이라 서버발 지시 채널 자체는 없다', () => {
    // 코드 자체 검토로 확인된 사실 — 별도 런타임 부작용 없음, 문서화 목적
    const code = fs.readFileSync(new URL('../security-agent.js', import.meta.url), 'utf-8');
    assert.match(code, /const COMMAND_URL = null/);
  });

  test('BUG CHECK: 그런데도 window.KSecAgent.executeCommand는 전역에 노출돼 있고, 아무 서명 없이 SUSPEND를 실행하면 실제로 페이지 전체가 중단된다', () => {
    const { document } = dom.window;
    assert.equal(document.getElementById('a').disabled, false, '사전 상태: 정상 활성화');

    // "K-Security 서버"를 거치지 않고, 같은 페이지의 임의 스크립트가
    // 직접 호출하는 상황을 재현 — 인증·서명·출처 검증이 전혀 없다.
    dom.window.KSecAgent.executeCommand({ type: 'SUSPEND', message: '가짜 지시' });

    assert.equal(document.getElementById('a').disabled, true,
      '서명 없는 임의 호출만으로 input이 비활성화됨 — 정상 K-Security 채널 검증 없이 서비스 중단 가능');
    assert.equal(document.getElementById('b').disabled, true);
    assert.equal(document.getElementById('c').disabled, true);
  });

  test('RESUME으로 되돌리는 것도 마찬가지로 무인증', () => {
    const { document } = dom.window;
    dom.window.KSecAgent.executeCommand({ type: 'RESUME' });
    assert.equal(document.getElementById('a').disabled, false);
  });
});
