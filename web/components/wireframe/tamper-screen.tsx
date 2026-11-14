"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tamperEnvelopeHashes } from "@/lib/relay/flow";
import { useStory } from "@/lib/story-context";
import { Btn, HashDiff, PageHead, Section, shortId, Tag } from "./c2";

export function TamperScreen() {
  const { state, toggleTamper } = useStory();
  const router = useRouter();
  const [approved, setApproved] = useState(state.artifactHash ?? "");
  const [presented, setPresented] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!state.tamper) return;
    const shareId = state.shareId;
    if (!shareId) return;
    let cancel = false;
    tamperEnvelopeHashes(shareId)
      .then((result) => {
        if (cancel) return;
        setApproved(result.approved || state.artifactHash || "");
        setPresented(result.presented);
        if (!result.approved) setNote("The contract has no artifact hash for this share yet.");
        else if (!result.presented) setNote("The approved hash is on NEAR. The envelope is not on this server, so the recomputed hash is left blank.");
      })
      .catch(() => {
        if (!cancel) setNote("The hash comparison could not be read.");
      });
    return () => {
      cancel = true;
    };
  }, [state.artifactHash, state.shareId, state.tamper]);

  const refused = state.lastOpenError === "ERR_TAMPER";
  const hashNote = state.tamper && !state.shareId ? "Approve a referral before this screen has an envelope hash." : note;

  return (
    <div>
      <PageHead
        index="07"
        eyebrow="Verification · Tamper test"
        title={<>Envelope changed.</>}
        second={<mark className="c2-mark red">Open refused.</mark>}
        lede="One byte is flipped after Maya approves. The recomputed hash has to differ from the hash logged on NEAR, or the hospital must not open the chart."
        state={state}
        bad
      />
      <div className="c2-cols" style={{ marginTop: 26, columnGap: 28 }}>
        <div>
          <div className="c2-band c2-rv" style={{ ["--d" as string]: 1 }}>
            <div>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.85, marginBottom: 8 }}>
                Verification
              </div>
              <b>{state.tamper ? "Envelope byte flipped" : "Tamper is off"}</b>
            </div>
            <Tag tone="bad">{refused ? "Blocked" : state.tamper ? "Armed" : "Off"}</Tag>
          </div>
          <Section index="A" title="Envelope hash" aside="Differences in red" delay={2}>
            <div className="c2-lab ink" style={{ marginBottom: 6 }}>
              Approved on NEAR
            </div>
            <div className="c2-hx">{approved || "No artifact hash yet"}</div>
            <div className="c2-lab ink" style={{ margin: "14px 0 6px" }}>
              Recomputed from the flipped envelope
            </div>
            {presented ? <HashDiff approved={approved} presented={presented} /> : <div className="c2-hx">{hashNote || "Waiting for the envelope."}</div>}
          </Section>
          <Section index="B" title="Refusal, logged" aside="On NEAR" bad delay={3}>
            <div className="c2-navy c2-term">
              {state.hospitalOpenTx ? (
                <>
                  <span className="dim">open_referral</span> <span className="ok">ok</span> tx {shortId(state.hospitalOpenTx, 8, 6)}
                  <br />
                </>
              ) : null}
              <span className="dim">open_referral</span> <span className="no">{refused ? "refused" : "not tried"}</span>{" "}
              {refused ? "envelope hash mismatch" : "flip is local until the hospital asks to open"}
            </div>
          </Section>
          <div className="c2-row c2-rv" style={{ ["--d" as string]: 4, marginTop: 20 }}>
            <Btn
              small
              tone="ghost"
              onClick={() => {
                if (state.tamper) toggleTamper();
                router.push("/verification");
              }}
            >
              Reset the envelope
            </Btn>
          </div>
        </div>
        <Section index="Checks" title="1 to 5" aside="Run as one bundle" bad delay={1}>
          <div style={{ paddingTop: 0 }}>
            <div className="c2-chk">
              <span className="n">01</span>
              <div>
                <b>Fresh client nonce</b>
              </div>
              <Tag tone={state.hospitalOpenTx || refused ? "q" : "qmut"}>{state.hospitalOpenTx || refused ? "Pass" : "Wait"}</Tag>
            </div>
            <div className="c2-chk">
              <span className="n">02</span>
              <div>
                <b>Gateway Intel quote</b>
              </div>
              <Tag tone={state.teeStatus === "green" ? "q" : "qmut"}>{state.teeStatus === "green" ? "Pass" : "Wait"}</Tag>
            </div>
            <div className="c2-chk">
              <span className="n">03</span>
              <div>
                <b>Nonce bound to report</b>
              </div>
              <Tag tone={state.teeStatus === "green" ? "q" : "qmut"}>{state.teeStatus === "green" ? "Pass" : "Wait"}</Tag>
            </div>
            <div className="c2-chk fail">
              <span className="n">04</span>
              <div>
                <b>Envelope hash matches approval</b>
                <p>{presented ? "The presented hash differs from the one logged on NEAR." : "Compared when the envelope is still on this server."}</p>
              </div>
              <Tag tone={presented ? "qbad" : "qmut"}>{presented ? "Fail" : "Wait"}</Tag>
            </div>
            <div className={refused ? "c2-chk fail" : "c2-chk"}>
              <span className="n">05</span>
              <div>
                <b>Hospital open</b>
                <p>{refused ? "Refused. The chart stays closed." : "Not tried in this session."}</p>
              </div>
              <Tag tone={refused ? "qbad" : "qmut"}>{refused ? "Refused" : "Not run"}</Tag>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
