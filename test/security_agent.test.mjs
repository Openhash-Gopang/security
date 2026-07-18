import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import crypto from 'node:crypto';

// security-agent.js는 "각 하위 시스템의 </body> 직전"에 <script>로 삽입되는
// 스크립트다 — 페이지에 다른 스크립트(광고, 위젯, 혹은 XSS로 주입된 코드)가
// 같이 떠 있다면 window.KSecAgent도 그 스크립트들과 같은 전역 공간을 공유한다.
//
// 2026-07-18 재설계 이전엔 window.KSecAgent.executeCommand가 아무 서명 없이
// 노출돼 있어 같은 페이지의 임의 스크립트가 SUSPEND(서비스 전체 중단)를
// 직접 실행할 수 있었다. 이번 테스트는 (1) 그 취약점이 실제로 막혔는지,
// (2) 새로 설계한 서명 검증 메커니즘이 올바르게 동작하는지 둘 다 검증한다.

function toB64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 이 테스트 전용 키쌍 — security-agent.js에 박제된 K_SECURITY_PUBLIC_KEY_B64U와
// 반드시 쌍이 맞아야 서명 검증 테스트가 의미 있다. 아래 assert로 그 사실 자체도 확인한다.
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEICnCLcqTtvnn/6jwA/AZxc9Rurlhy4qy2onNa13Zph87
-----END PRIVATE KEY-----`;
const EXPECTED_PUBLIC_KEY_B64U = 'PvNb36dACs6kHUKJRW89muIta7wmsX56HMez8F2z2F0';

function signCommand({ svc_id, type, params, ts }) {
  const msg = `ksec-command:${svc_id}:${type}:${JSON.stringify(params || {})}:${ts}`;
  const privateKey = crypto.createPrivateKey(TEST_PRIVATE_KEY_PEM);
  const sig = crypto.sign(null, Buffer.from(msg), privateKey);
  return { svc_id, type, params, ts, signature: toB64u(sig) };
}

describe('security-agent.js — 전역 노출 제거 + 서명 검증 재설계', () => {
  let dom;

  before(() => {
    dom = new JSDOM(`
      <!doctype html><html><body>
        <input id="a"><button id="b">클릭</button><textarea id="c"></textarea>
        <script id="ksec-agent" data-svc="school" data-url="school.hondi.net"></script>
      </body></html>
    `, { runScripts: 'outside-only', url: 'https://school.hondi.net/' });

    dom.window.setInterval = () => 0;
    dom.window.clearInterval = () => {};
    dom.window.fetch = async () => ({ ok: true, json: async () => ({}) });
    // jsdom은 Web Crypto subtle을 구현하지 않아 Node의 것을 주입한다
    // (프로덕션 브라우저 환경에는 이미 존재 — 테스트 환경만의 보강).
    dom.window.crypto.subtle = crypto.webcrypto.subtle;

    const code = fs.readFileSync(new URL('../security-agent.js', import.meta.url), 'utf-8');
    dom.window.eval(code);
  });

  after(() => { dom.window.close(); });

  test('스크립트에 박제된 공개키가 테스트에서 쓰는 개인키와 실제로 쌍을 이룬다', () => {
    const code = fs.readFileSync(new URL('../security-agent.js', import.meta.url), 'utf-8');
    const m = code.match(/K_SECURITY_PUBLIC_KEY_B64U\s*=\s*'([^']+)'/);
    assert.equal(m[1], EXPECTED_PUBLIC_KEY_B64U,
      '이 assert가 깨지면 아래 서명 테스트들은 실제로 아무것도 검증하지 못하는 상태다');
  });

  test('취약점 수정 확인: window.KSecAgent.executeCommand는 더 이상 존재하지 않는다', () => {
    assert.equal(dom.window.KSecAgent.executeCommand, undefined);
  });

  test('서명 없이 receiveSignedCommand를 호출하면 거부되고 아무 효과도 없다', async () => {
    const { document } = dom.window;
    const r = await dom.window.KSecAgent.receiveSignedCommand({ svc_id: 'school', type: 'SUSPEND', ts: Date.now() / 1000 });
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'MISSING_FIELD');
    assert.equal(document.getElementById('a').disabled, false);
  });

  test('위조된(임의 바이트) 서명은 거부된다', async () => {
    const { document } = dom.window;
    const fake = { svc_id: 'school', type: 'SUSPEND', params: {}, ts: Date.now() / 1000, signature: toB64u(Buffer.from('not-a-real-signature-at-all-000000')) };
    const r = await dom.window.KSecAgent.receiveSignedCommand(fake);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'BAD_SIGNATURE');
    assert.equal(document.getElementById('a').disabled, false);
  });

  test('다른 서비스(traffic)용으로 정상 서명된 명령을 school에서 재생(replay)하면 거부된다', async () => {
    const cmdForTraffic = signCommand({ svc_id: 'traffic', type: 'SUSPEND', params: {}, ts: Date.now() / 1000 });
    const r = await dom.window.KSecAgent.receiveSignedCommand(cmdForTraffic);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'SVC_MISMATCH');
  });

  test('신선도(5분) 지난 서명은 정상 서명이어도 거부된다(재생 공격 방지)', async () => {
    const staleCmd = signCommand({ svc_id: 'school', type: 'SUSPEND', params: {}, ts: Date.now() / 1000 - 3600 });
    const r = await dom.window.KSecAgent.receiveSignedCommand(staleCmd);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'STALE_SIGNATURE');
  });

  test('화이트리스트에 없는 명령 타입은 서명이 맞아도 거부된다', async () => {
    const weirdCmd = signCommand({ svc_id: 'school', type: 'DELETE_EVERYTHING', params: {}, ts: Date.now() / 1000 });
    const r = await dom.window.KSecAgent.receiveSignedCommand(weirdCmd);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'UNKNOWN_TYPE');
  });

  test('유효한 서명 + 올바른 svc_id + 신선한 ts → 실제로 SUSPEND가 실행된다', async () => {
    const { document } = dom.window;
    const validCmd = signCommand({ svc_id: 'school', type: 'SUSPEND', params: { message: '정상 지시' }, ts: Date.now() / 1000 });
    const r = await dom.window.KSecAgent.receiveSignedCommand(validCmd);
    assert.equal(r.accepted, true);
    assert.equal(document.getElementById('a').disabled, true);
    assert.equal(document.getElementById('b').disabled, true);
  });

  test('params를 위조(메시지 변조)하면 서명이 더 이상 맞지 않아 거부된다', async () => {
    const validCmd = signCommand({ svc_id: 'school', type: 'SHOW_ALERT', params: { message: '원본 메시지' }, ts: Date.now() / 1000 });
    // 서명은 그대로 두고 내용만 바꿔치기 — 서명이 원본 메시지에 대해서만 유효하므로 실패해야 함
    validCmd.params.message = '위조된 메시지';
    const r = await dom.window.KSecAgent.receiveSignedCommand(validCmd);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'BAD_SIGNATURE');
  });
});

