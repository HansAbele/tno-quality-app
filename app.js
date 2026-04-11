// Sanitize marked output — strip any raw HTML tags from AI responses
const markedRenderer = new marked.Renderer();
marked.setOptions({
  renderer: markedRenderer,
  breaks: true
});
function sanitizeHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const frag = template.content;
  frag.querySelectorAll("script, iframe, object, embed, form, input, textarea, style, link, meta, base, svg").forEach(el => el.remove());
  frag.querySelectorAll("*").forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("on") || attr.name === "srcdoc" || attr.name === "href" && attr.value.trim().toLowerCase().startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener noreferrer"); }
  });
  const safe = document.createElement("div");
  safe.appendChild(frag.cloneNode(true));
  return safe.innerHTML;
}

// Denial codes loaded from external JSON
let denialCodesDB = {};

document.addEventListener("DOMContentLoaded", async () => {
  // Load denial codes from JSON file
  try {
    const response = await fetch("./denial_codes.json");
    denialCodesDB = await response.json();
  } catch (err) {
    console.error("Failed to load denial codes:", err);
  }

  // Listeners
  const scenarioSelect = document.getElementById("call-scenario");
  scenarioSelect.addEventListener("change", updateScenario);

  const callerSelect = document.getElementById("caller-type");
  callerSelect.addEventListener("change", updateCallerType);

  document.querySelectorAll('input[name="hipaa"], input[name="pt-minor"]').forEach(radio => {
    radio.addEventListener("change", updateCallerType);
  });

  document.querySelectorAll('input[name="claim-status-radio"]').forEach(radio => {
    radio.addEventListener("change", updateClaimStatus);
  });

  const denialInput = document.getElementById("denial-code-input");
  denialInput.addEventListener("keyup", checkDenialCode);

  document.getElementById("is-iihs").addEventListener("change", updateScenario);
  document.getElementById("is-iihs-law").addEventListener("change", updateScenario);
  document.getElementById("chk-sent").addEventListener("change", updateScenario);
  document.querySelectorAll('input[name="ticket-status"]').forEach(r => r.addEventListener("change", updateScenario));

  document.getElementById("pp-balance").addEventListener("input", calculatePaymentPlan);
  document.getElementById("sp-amount").addEventListener("input", calculateSelfPay);
  document.getElementById("sp-percent").addEventListener("input", calculateSelfPay);
  document.getElementById("escalation-reason").addEventListener("change", validateEscalation);

  document.getElementById("end-call-btn").addEventListener("click", endCall);

  document.getElementById("checklist-container").addEventListener("change", function (e) {
    if (e.target.classList.contains("step")) {
      const allSteps = Array.from(document.querySelectorAll(".step"));
      const index = allSteps.indexOf(e.target);

      if (index > 0 && !allSteps[index - 1].checked) {
        e.target.checked = false;
        alert("\u26a0\ufe0f Sequence Error: Please complete the previous step first.");
        return;
      }
      if (e.target.checked && index < allSteps.length - 1) {
        const nextItem = allSteps[index + 1].closest(".checklist-item");
        if (nextItem) nextItem.classList.remove("disabled");
      }
      updateProgress(allSteps);
    }
  });

  // Copilot Chat Interaction
  const copilotBtn = document.getElementById("copilot-btn");
  const chatContainer = document.getElementById("chat-container");
  const chatCloseBtn = document.getElementById("chat-close-btn");
  const chatInput = document.getElementById("chat-input");
  const chatSendBtn = document.getElementById("chat-send-btn");
  const chatMessages = document.getElementById("chat-messages");

  copilotBtn.addEventListener("click", () => {
    chatContainer.classList.add("active");
    chatInput.focus();
    const ts = document.getElementById("chat-timestamp");
    if (ts && !ts.textContent) {
      const now = new Date();
      ts.textContent = `Today, ${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}).toLowerCase()}`;
    }
  });

  chatCloseBtn.addEventListener("click", () => {
    chatContainer.classList.remove("active");
  });

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms))
    ]);
  }

  let isSending = false;

  function checkSendChat() {
    if (isSending) return;
    const text = chatInput.value.trim();
    if (text) sendChatMessage(text);
  }

  chatSendBtn.addEventListener("click", checkSendChat);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") checkSendChat();
  });

  // --- VOICE DICTATION (MediaRecorder + Gemini Transcription) ---
  const micBtn = document.getElementById("mic-btn");
  const micIcon = document.getElementById("mic-icon");
  const inputWrapper = document.getElementById("chat-input-wrapper");
  const recordingBar = document.getElementById("recording-bar");
  const recordingTimer = document.getElementById("recording-timer");
  const recordingLabel = recordingBar ? recordingBar.querySelector(".recording-label") : null;

  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let isTranscribing = false;
  let recTimerInterval = null;
  let recSeconds = 0;

  function startRecordingUI() {
    isRecording = true;
    micBtn.classList.add("recording");
    micIcon.className = "ph ph-stop-fill";
    inputWrapper.classList.add("recording");
    recordingBar.classList.add("active");
    if (recordingLabel) recordingLabel.textContent = "Listening...";
    chatSendBtn.classList.add("disabled");
    recSeconds = 0;
    recordingTimer.textContent = "0:00";
    recTimerInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = recSeconds % 60;
      recordingTimer.textContent = m + ":" + String(s).padStart(2, "0");
    }, 1000);
  }

  function stopRecordingUI() {
    isRecording = false;
    isTranscribing = false;
    clearInterval(recTimerInterval);
    micBtn.classList.remove("recording");
    micIcon.className = "ph ph-microphone";
    inputWrapper.classList.remove("recording");
    recordingBar.classList.remove("active");
    if (recordingLabel) recordingLabel.textContent = "Listening...";
    chatSendBtn.classList.remove("disabled");
  }

  async function startRecording() {
    if (isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());

        if (audioChunks.length === 0) {
          stopRecordingUI();
          return;
        }

        isTranscribing = true;
        if (recordingLabel) recordingLabel.textContent = "Transcribing...";

        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onerror = () => {
          stopRecordingUI();
          appendMessage("system", "Failed to process audio recording. Please try again.");
        };
        reader.onloadend = async () => {
          if (!reader.result || typeof reader.result !== "string" || !reader.result.includes(",")) {
            stopRecordingUI();
            appendMessage("system", "Failed to process audio recording. Please try again.");
            return;
          }
          const base64 = reader.result.split(",")[1];
          try {
            const result = await withTimeout(window.electronAPI.transcribeAudio(base64), 45000);
            stopRecordingUI();
            if (result && result.text) {
              const prev = chatInput.value;
              chatInput.value = prev + (prev ? " " : "") + result.text;
              chatInput.focus();
            } else if (result && result.error) {
              appendMessage("system", "Transcription error: " + result.error);
            }
          } catch (err) {
            stopRecordingUI();
            appendMessage("system", err.message === "Request timed out" ? "Transcription timed out. Please try again." : "Transcription failed. Please try again.");
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      startRecordingUI();
    } catch (err) {
      stopRecordingUI();
      if (err.name === "NotAllowedError") {
        appendMessage("system", "Microphone access denied. Please allow microphone permissions in your system settings.");
      } else if (err.name === "NotFoundError") {
        appendMessage("system", "No microphone found. Please connect a microphone and try again.");
      } else {
        appendMessage("system", "Could not access microphone: " + err.message);
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  micBtn.addEventListener("click", () => {
    if (isTranscribing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  async function sendChatMessage(text) {
    isSending = true;
    chatSendBtn.classList.add("disabled");
    chatInput.value = "";
    appendMessage("user", text);

    const typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-indicator";
    typingIndicator.id = "typing-indicator";
    typingIndicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const reply = await withTimeout(window.electronAPI.askCopilot(text), 30000);
      document.getElementById("typing-indicator")?.remove();

      if (reply && reply.content) {
        appendMessage("system", reply.content);
      } else {
        appendMessage("system", "I'm sorry, I'm having trouble connecting right now.");
      }
    } catch (err) {
      document.getElementById("typing-indicator")?.remove();
      appendMessage("system", "Error connecting to AI Provider. Please check logs.");
    } finally {
      isSending = false;
      chatSendBtn.classList.remove("disabled");
    }
  }

  function appendMessage(sender, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-msg ${sender}-msg`;

    const formattedText = sanitizeHTML(marked.parse(text));

    const botAvatar = '<img src="assets/img/logo.png" style="width:22px;height:22px;object-fit:contain;" alt="Bot">';
    const userIcon = '<i class="ph ph-user" style="color:white;font-size:1rem;"></i>';

    if (sender === "system") {
      msgDiv.innerHTML = `
        <div class="sender-name">TNO Billing Copilot</div>
        <div class="system-msg-row">
          <div class="msg-avatar">${botAvatar}</div>
          <div class="msg-bubble system-bubble">${formattedText}</div>
        </div>`;
    } else {
      msgDiv.innerHTML = `
        <div class="msg-avatar" style="background:var(--tno-blue);">${userIcon}</div>
        <div class="msg-bubble user-bubble">${formattedText}</div>`;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Expose for global access (used by denial code "Ask Copilot" button)
  window._openCopilotWithQuestion = function(question) {
    const container = document.getElementById("chat-container");
    container.classList.add("active");
    const ts = document.getElementById("chat-timestamp");
    if (ts && !ts.textContent) {
      const now = new Date();
      ts.textContent = `Today, ${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}).toLowerCase()}`;
    }
    sendChatMessage(question);
  };
});

// Global function called from denial code button
function askCopilotAboutDenial(code, desc) {
  const question = `The patient has denial code ${code} (${desc}). What should I do? Explain what this means, what caused it, and give me step-by-step instructions on how to handle this with the patient.`;
  if (window._openCopilotWithQuestion) {
    window._openCopilotWithQuestion(question);
  }
}

// --- BUSINESS LOGIC FUNCTIONS ---

function updateCallerType() {
  const type = document.getElementById("caller-type").value;
  const hipaaInstructions = document.getElementById("hipaa-instructions");
  const hipaaRadioContainer = document.getElementById("hipaa-radio-container");
  const parentMinorCheck = document.getElementById("parent-minor-check");
  const lawyerAuthContainer = document.getElementById("lawyer-auth-container");
  const stepVerifyText = document.getElementById("step-verify-text");

  hipaaRadioContainer.style.display = "none";
  lawyerAuthContainer.style.display = "none";
  parentMinorCheck.style.display = "none";

  hipaaInstructions.style.display = "block";
  hipaaInstructions.className = "hipaa-instruction-box";
  hipaaInstructions.style.borderColor = "";
  hipaaInstructions.style.color = "";
  hipaaInstructions.style.border = "";

  let hipaaStatus = document.querySelector('input[name="hipaa"]:checked')?.value;
  let instructionHTML = "";
  let verifyText = "2. Verify Demographics (Name, DOB & Addr)";

  if (!type) {
    hipaaInstructions.style.display = "none";
    stepVerifyText.innerText = "2. Verify Demographics";
    return;
  }

  if (type === "patient" || type === "spouse") {
    verifyText = "2. Verify Demographics (Name, DOB, Addr, Phone# & Email)";
  }

  if (type === "patient") {
    instructionHTML = "\u2705 <strong>PATIENT:</strong> Full Access Allowed.";
    hipaaInstructions.classList.add("hipaa-allowed");
  }
  else if (["insurance", "facility"].includes(type)) {
    instructionHTML = "\u2705 <strong>COVERED ENTITY:</strong> Can provide Billing Information. No Personal Info (Notes/etc).";
    hipaaInstructions.classList.add("hipaa-allowed");
  }
  else if (type === "parent") {
    parentMinorCheck.style.display = "block";
    const isMinor = document.querySelector('input[name="pt-minor"]:checked')?.value;
    if (isMinor === "yes") {
      instructionHTML = "\u2705 <strong>PARENT (MINOR):</strong> Full Access Allowed.";
      hipaaInstructions.classList.add("hipaa-allowed");
    } else if (isMinor === "no") {
      instructionHTML = "\ud83d\udeab <strong>PARENT (ADULT PT):</strong> We can update Insurance set, received Payments, take Payment details, or provide Balance on the Account. Do not share personal or claim info with caller.";
      hipaaInstructions.classList.add("hipaa-blocked");
    } else {
      instructionHTML = "\u2753 Please select if Patient is Minor or Adult.";
      hipaaInstructions.style.border = "1px dashed #cbd5e1";
    }
  }
  else if (type === "lawyer") {
    lawyerAuthContainer.style.display = "block";
    const chartStatus = document.getElementById("lawyer-chartswap-status").value;
    if (chartStatus === "completed") {
      instructionHTML = "\u2705 <strong>Authorization Verified.</strong> You may release information ONLY for the specific Date of Service (DOS) range approved in the request. <br><strong>Warning:</strong> Verify the start and end dates on the ChartSwap approval before discussing medical records or billing details.";
      hipaaInstructions.classList.add("hipaa-allowed");
    } else if (chartStatus === "rejected") {
      instructionHTML = "\u26d4 <strong>Request Rejected.</strong> Do NOT provide any account details. Advise the caller to resubmit the request via ChartSwap. <br><strong>Allowed actions:</strong> Update insurance info, confirm received payments, or take payment details only.";
      hipaaInstructions.classList.add("hipaa-blocked");
    } else if (chartStatus === "new") {
      instructionHTML = "\u23f3 <strong>Request Pending.</strong> The request is currently marked as 'New'. Please advise the caller that we cannot release records until the status updates to 'Completed'. <br>No information can be shared at this time.";
      hipaaInstructions.classList.add("alert-warning");
    } else {
      instructionHTML = "\u2753 Please verify status in ChartSwap.";
      hipaaInstructions.style.border = "1px dashed #cbd5e1";
    }
  }
  else {
    hipaaRadioContainer.style.display = "block";
    if (hipaaStatus === "auth") {
      hipaaInstructions.classList.add("hipaa-allowed");
      instructionHTML = "\u2705 <strong>AUTHORIZED:</strong> Access allowed per HIPAA form.";
    } else {
      hipaaInstructions.classList.add("hipaa-blocked");
      instructionHTML = "\ud83d\udeab <strong>NO AUTH:</strong> We can update Insurance set, received Payments, take Payment details, or provide Balance on the Account. Do not share personal or claim info with caller.";
    }
  }

  hipaaInstructions.innerHTML = instructionHTML;
  stepVerifyText.innerText = verifyText;
}

function updateScenario() {
  const scenario = document.getElementById("call-scenario").value;
  const infoBox = document.getElementById("dynamic-info-box");
  const dynamicStepsDiv = document.getElementById("dynamic-steps");

  const forms = [
    "insurance-submit-form", "injury-form", "check-payment-form",
    "claim-status-box", "deceased-form", "escalation-form",
    "refund-options", "lawfirm-form", "selfpay-calc-box",
    "payment-calc-box", "escalation-validator-box", "balance-inquiry-box"
  ];
  forms.forEach(id => document.getElementById(id).style.display = "none");

  document.getElementById("followup-options").style.display = "none";
  document.getElementById("payment-plan-guide").style.display = "none";
  document.getElementById("denial-input-container").style.display = "none";

  infoBox.style.display = "none";
  infoBox.className = "dynamic-info";
  dynamicStepsDiv.innerHTML = "";

  document.querySelectorAll('.accordion__trigger[aria-expanded="true"]').forEach(btn => {
    const content = btn.parentElement.nextElementSibling;
    const icon = btn.querySelector('.icon-indicator');
    btn.setAttribute('aria-expanded', 'false');
    content.style.display = 'none';
    content.setAttribute('aria-hidden', 'true');
    if (icon) icon.textContent = '+';
  });

  const iconStyle = 'style="font-size:1.5rem; vertical-align:middle; margin-right:5px;"';

  if (scenario === "payment") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-danger");
    infoBox.innerHTML = `<i class="ph ph-shield-warning" ${iconStyle}></i> <strong>REMINDER: PLEASE MASK THE CALL!</strong><br>Posting Timeframe: 7-10 Days.`;
    dynamicStepsDiv.innerHTML = '<label class="checklist-item"><input type="checkbox" class="step"> <i class="ph ph-lock-key"></i> Masked & Processed</label>';
  }
  else if (scenario === "claim_status") {
    document.getElementById("claim-status-box").style.display = "block";
    const status = document.querySelector('input[name="claim-status-radio"]:checked')?.value;
    if(status) updateClaimStatus();
  }
  else if (scenario === "payment_plan") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-warning");
    infoBox.innerHTML = `<i class="ph ph-calendar-check" ${iconStyle}></i> <strong>REMINDER:</strong> Advise Due Date is the 15th.`;
    document.getElementById("payment-plan-guide").style.display = "block";
    document.getElementById("payment-calc-box").style.display = "block";
  }
  else if (scenario === "balance_inquiry") {
    document.getElementById("balance-inquiry-box").style.display = "block";
  }
  else if (scenario === "submit_claim") {
    document.getElementById("insurance-submit-form").style.display = "block";
  }
  else if (scenario === "check_payment") {
    document.getElementById("check-payment-form").style.display = "block";
    const days = checkPaymentTimeframe();
    if (days !== "unknown") {
      infoBox.style.display = "block";
      if (days > 21) {
        infoBox.className = "dynamic-info alert-success";
        infoBox.innerHTML = `<strong>${days} DAYS PASSED.</strong> Escalate to AR.`;
      } else {
        infoBox.className = "dynamic-info alert-warning";
        infoBox.innerHTML = `<strong>${days} DAYS PASSED.</strong> Advise to wait.`;
      }
    }
  }
  else if (scenario === "refund") {
    document.getElementById("refund-options").style.display = "block";
    const isIIHS = document.getElementById("is-iihs").checked;
    infoBox.style.display = "block";
    infoBox.className = isIIHS ? "dynamic-info alert-success" : "dynamic-info alert-info";
    infoBox.innerHTML = isIIHS ? '<strong>Processing Time:</strong> Electronic Payments (24-48h).' : '<strong>STANDARD (CHECK/MONEY ORDER):</strong> 6-8 Weeks.';
  }
  else if (scenario === "paper_bill") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-info");
    infoBox.innerHTML = `<i class="ph ph-envelope-simple" ${iconStyle}></i> Timeframe: 5-7 Business Days.<br>Advise to reply <strong>STOP</strong> to texts/emails.`;
  }
  else if (scenario === "escalation_sup") {
    document.getElementById("escalation-form").style.display = "block";
  }
  else if (scenario === "escalation_ar") {
    document.getElementById("escalation-validator-box").style.display = "block";
  }
  else if (scenario === "law_firm") {
    document.getElementById("lawfirm-form").style.display = "block";
    const isIIHSLaw = document.getElementById("is-iihs-law").checked;
    document.getElementById("iihs-law-instruction").style.display = isIIHSLaw ? "block" : "none";
    document.getElementById("regular-law-instruction").style.display = isIIHSLaw ? "none" : "block";
  }
  else if (scenario === "hsa_payment") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-info");
    infoBox.innerHTML = `<i class="ph ph-bank" ${iconStyle}></i> <strong>HSA/HRA/Bill Pay:</strong> These payments take approx 30 DAYS to post.`;
  }
  else if (scenario === "patient_deceased") {
    document.getElementById("deceased-form").style.display = "block";
  }
  else if (scenario === "mva") {
    document.getElementById("injury-form").style.display = "block";
    document.getElementById("injury-title").innerHTML = '<i class="ph ph-car"></i> MVA Details';
    document.getElementById("injury-list").innerHTML = '<li>Insurance Name</li><li>Claim Number</li><li>Date of Accident</li><li>Mailing Address / Payer ID</li><li>Adjuster Info (Name, Phone, Email)</li>';
  }
  else if (scenario === "wc") {
    document.getElementById("injury-form").style.display = "block";
    document.getElementById("injury-title").innerHTML = '<i class="ph ph-briefcase"></i> Workers\' Comp Details';
    document.getElementById("injury-list").innerHTML = '<li>Insurance Name</li><li>Claim Number</li><li>Date of Injury</li><li>Mailing Address / Payer ID</li><li>Adjuster Info (Name, Phone, Email)</li>';
  }
  else if (scenario === "veteran") {
    document.getElementById("injury-form").style.display = "block";
    document.getElementById("injury-title").innerHTML = '<i class="ph ph-medal"></i> VA / Tricare Details';
    document.getElementById("injury-list").innerHTML = '<li><strong>VA:</strong> SSN, VA Authorization #, Validity Date.</li><li><strong>Tricare:</strong> SSN or Benefits #, Mailing Address, Subscriber Info.</li><li><em>If VA Auth missing -> Refer to Insurance.</em></li>';
  }
  else if (scenario === "selfpay") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-info");
    infoBox.innerHTML = `<i class="ph ph-file-text" ${iconStyle}></i> PLEASE CHECK CLIENT FACT SHEET FOR DISCOUNT POLICY`;
    document.getElementById("selfpay-calc-box").style.display = "block";
  }
  else if (scenario === "charity") {
    infoBox.style.display = "block";
    infoBox.classList.add("alert-info");
    infoBox.innerHTML = `<i class="ph ph-heart" ${iconStyle}></i> PLEASE CHECK CLIENT FACT SHEET FOR CHARITY CARE POLICY`;
  }
  else if (scenario === "followup") {
    document.getElementById("followup-options").style.display = "block";
    const status = document.querySelector('input[name="ticket-status"]:checked')?.value;
    if (status === "resolved") {
      infoBox.style.display = "block";
      infoBox.classList.add("alert-success");
      infoBox.innerHTML = '\u2705 <strong>RESOLVED:</strong> Read AR Resolution Note to Patient.';
    } else if (status === "process") {
      infoBox.style.display = "block";
      infoBox.classList.add("alert-warning");
      infoBox.innerHTML = '\u23f3 <strong>IN PROCESS:</strong> Advise AR is still working. Ask to wait.';
    } else if (status === "stalled") {
      infoBox.style.display = "block";
      infoBox.classList.add("alert-danger");
      infoBox.innerHTML = '\u26a0\ufe0f <strong>STALLED:</strong> Multiple escalations? Email Supervisor for assistance.';
    }
  }

  // Update closing script based on scenario
  updateClosingScript(scenario);

  const allSteps = Array.from(document.querySelectorAll(".step"));
  if (allSteps.length > 0) updateProgress(allSteps);
}

function updateClosingScript(scenario) {
  const el = document.getElementById("closing-script");
  if (!el) return;

  const base = '"Anything else I can help with? ...';
  const closing = 'Thank you for calling <strong>Physician\'s Billing</strong>. Have a great day!"';

  const scenarioTips = {
    payment: 'Your payment will be posted within <strong>7-10 business days</strong>.',
    payment_plan: 'Your first payment is due on the <strong>15th</strong>. You\'ll receive a confirmation.',
    check_payment: 'Please allow <strong>21 business days</strong> for processing.',
    hsa_payment: 'HSA/HRA payments take approximately <strong>30 days</strong> to post.',
    paper_bill: 'Your statement will arrive within <strong>5-7 business days</strong>.',
    refund: 'Your refund will be processed. Please allow the estimated timeframe we discussed.',
    submit_claim: 'We\'ll submit your claim. Processing takes <strong>30-45 days</strong>.',
    escalation_sup: 'You\'ll receive a callback within <strong>1 business day</strong>.',
    escalation_ar: 'Our AR team will review your case. Allow <strong>3-5 business days</strong>.',
    claim_status: 'If you have further questions about your claim, don\'t hesitate to call us back.',
    balance_inquiry: 'If you have further questions about your balance, feel free to call us back.',
    followup: 'We\'ll continue working on your case. Feel free to call back for updates.',
    patient_deceased: 'We\'re sorry for your loss. Please send the documents we discussed to the email provided.',
    selfpay: 'Remember, the discount applies <strong>only if paid today</strong>.',
    charity: 'Please submit the required documentation for charity care review.',
    veteran: 'If you have any issues with your VA/Tricare coverage, please call us back.',
    mva: 'Please provide the accident insurance details as soon as possible.',
    wc: 'Please have your employer\'s Workers\' Comp carrier contact us if needed.',
    law_firm: 'Please ensure all requests go through <strong>ChartSwap</strong> for processing.'
  };

  const tip = scenarioTips[scenario];
  if (tip) {
    el.innerHTML = `${base} <strong>${tip}</strong> ... ${closing}`;
  } else {
    el.innerHTML = `${base} ${closing}`;
  }
}

function updateClaimStatus() {
  const status = document.querySelector('input[name="claim-status-radio"]:checked')?.value;
  const denialContainer = document.getElementById("denial-input-container");
  const infoBox = document.getElementById("dynamic-info-box");
  const denialInput = document.getElementById("denial-code-input");

  infoBox.style.display = "none";
  infoBox.className = "dynamic-info";

  if (status === "process") {
    denialContainer.style.display = "none";
    denialInput.value = "";
    infoBox.style.display = "block";
    infoBox.classList.add("alert-info");
    infoBox.innerHTML = '<strong>PROCESSING:</strong> Timeframe 30-45 Days.';
  } else if (status === "denied") {
    denialContainer.style.display = "block";
    infoBox.style.display = "none";
  }
}

function checkDenialCode() {
  const rawCode = document.getElementById("denial-code-input").value;
  const code = rawCode.trim().toUpperCase();
  const infoBox = document.getElementById("dynamic-info-box");

  if (!code) {
    infoBox.style.display = "none";
    return;
  }

  infoBox.style.display = "block";
  infoBox.className = "dynamic-info";

  if (denialCodesDB.hasOwnProperty(code)) {
    const data = denialCodesDB[code];

    if (data.action.includes("ARF")) {
      infoBox.classList.add("alert-danger");
    } else if (data.action.includes("PT RESP")) {
      infoBox.classList.add("alert-info");
    } else {
      infoBox.classList.add("alert-warning");
    }

    infoBox.innerHTML = `
      <div style="font-size:0.9rem; font-weight:800; border-bottom:1px solid rgba(0,0,0,0.1); margin-bottom:5px;">DENIAL: ${code}</div>
      <div style="font-size:0.8rem; margin-bottom:5px;"><em>${data.desc}</em></div>
      <div style="font-weight:700; text-transform:uppercase;">ACTION: ${data.action}</div>
      <button onclick="askCopilotAboutDenial('${code}', '${data.desc.replace(/'/g, "\\'")}')" style="margin-top:8px; width:auto; padding:6px 14px; font-size:0.75rem; background:var(--tno-blue); border-radius:20px; display:inline-flex; align-items:center; gap:6px;">
        <i class="ph ph-robot" style="color:white; font-size:0.9rem; margin:0;"></i> Ask Copilot about this
      </button>
    `;
  } else {
    infoBox.classList.add("alert-warning");
    infoBox.innerHTML = `CODE <strong>${code}</strong>: NOT FOUND IN DB. CHECK CLIENT FACT SHEET.`;
  }
}

function updateProgress(allSteps) {
  const checkedCount = allSteps.filter((s) => s.checked).length;
  const total = allSteps.length;
  const percent = total === 0 ? 0 : Math.round((checkedCount / total) * 100);
  document.getElementById("progress-bar").style.width = percent + "%";
  document.getElementById("quality-score").innerText = `QA: ${percent}%`;
  if (percent === 100 && total > 0) {
    document.getElementById("congrats-msg").style.display = "block";
    document.getElementById("end-call-btn").disabled = false;
  }
}

// --- UTILITY FUNCTIONS ---
function checkPaymentTimeframe() {
  const sentDateVal = document.getElementById("chk-sent").value;
  if (!sentDateVal) return "unknown";
  const diff = new Date() - new Date(sentDateVal);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculatePaymentPlan() {
  const balance = parseFloat(document.getElementById("pp-balance").value);
  const res = document.getElementById("pp-result-container");
  if (isNaN(balance) || balance <= 0) { res.style.display="none"; return; }

  let months = 0;
  if (balance <= 100) months = 2;
  else if (balance <= 300) months = 4;
  else if (balance <= 600) months = 6;
  else if (balance <= 900) months = 8;
  else if (balance <= 1200) months = 10;
  else if (balance <= 1500) months = 12;
  else months = Math.ceil(balance / 100);

  document.getElementById("pp-result-text").innerText = `$${(balance/months).toFixed(2)}`;
  document.getElementById("pp-result-term").innerText = `(Term: ${months} months)`;
  res.style.display="block";
}

function calculateSelfPay() {
  const amt = parseFloat(document.getElementById("sp-amount").value);
  const pct = parseFloat(document.getElementById("sp-percent").value);
  if(isNaN(amt) || isNaN(pct) || amt <= 0 || pct <= 0 || pct > 100) { document.getElementById("sp-result-container").style.display="none"; return; }
  const saved = amt * (pct/100);
  document.getElementById("sp-saved").innerText = `$${saved.toFixed(2)}`;
  document.getElementById("sp-total").innerText = `$${(amt - saved).toFixed(2)}`;
  document.getElementById("sp-result-container").style.display="block";
}

function validateEscalation() {
  const reason = document.getElementById("escalation-reason").value;
  const box = document.getElementById("esc-alert");
  if(!reason) { box.style.display="none"; return; }

  box.style.display="block";
  box.className = "escalation-alert";

  if(reason === "missing_info" || reason === "valid_other") {
    box.classList.add("alert-success"); box.innerHTML = "\u2705 VALID ESCALATION.";
  } else if(reason === "hsa_hra" || reason === "pull_coll") {
    box.classList.add("alert-warning"); box.innerHTML = "\u26a0\ufe0f CONDITIONAL CHECK.";
  } else {
    box.classList.add("alert-danger"); box.innerHTML = "\ud83d\udeab INVALID / DO NOT ESCALATE.";
  }
}

// --- END CALL / RESET LOGIC ---
function resetUI() {
  document.getElementById("caller-type").value = "";
  document.getElementById("greeting-accordion").style.display = "none";
  document.getElementById("call-scenario").value = "";
  document.querySelectorAll("input").forEach(i => {
    if(i.type === 'checkbox' || i.type === 'radio') i.checked = false;
    else i.value = "";
  });

  document.querySelectorAll(".scenario-form-box").forEach(b => b.style.display = "none");
  document.getElementById("denial-input-container").style.display = "none";

  document.querySelectorAll(".step").forEach((s, idx) => {
    s.checked = false;
    if (idx > 0) s.parentElement.classList.add("disabled");
    else s.parentElement.classList.remove("disabled");
  });

  updateCallerType();
  updateScenario();

  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("quality-score").innerText = "QA: 0%";
  document.getElementById("congrats-msg").style.display = "none";
  document.getElementById("end-call-btn").disabled = true;

  const chatContainer = document.getElementById("chat-container");
  if(chatContainer) chatContainer.classList.remove("active");

  const chatMessages = document.getElementById("chat-messages");
  if(chatMessages) {
    const children = Array.from(chatMessages.children);
    for(let i = 2; i < children.length; i++) {
      chatMessages.removeChild(children[i]);
    }
  }

  document.querySelector(".content").scrollTop = 0;
}

async function endCall() {
  if (window.electronAPI) {
    try {
      const callerType = document.getElementById("caller-type").value;
      const scenario = document.getElementById("call-scenario").value;
      const hipaaStatus = document.querySelector('input[name="hipaa"]:checked')?.value || null;
      const escalationReason = document.getElementById("escalation-reason").value || null;
      const denialCode = document.getElementById("denial-code-input").value.trim().toUpperCase() || null;
      const allSteps = Array.from(document.querySelectorAll(".step"));
      const completedSteps = allSteps.filter(s => s.checked).length;
      const totalSteps = allSteps.length;
      const qaScore = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      await window.electronAPI.saveCallData({
        date: new Date().toISOString(),
        scenario,
        callerType,
        hipaaStatus,
        escalationReason,
        denialCode,
        qaScore,
        completedSteps,
        totalSteps
      });
    } catch (err) { console.error(err); }
  }
  resetUI();
}

// --- ACCORDION INIT ---
(function initAccordions() {
  const greetingStep = document.getElementById("greeting-step");
  const greetingAccordion = document.getElementById("greeting-accordion");
  if (greetingStep && greetingAccordion) {
    greetingStep.addEventListener("change", (e) => {
      greetingAccordion.style.display = e.target.checked ? "block" : "none";
    });
  }

  document.addEventListener("click", function(e) {
    const trigger = e.target.closest(".accordion__trigger");
    if (!trigger) return;
    const isExpanded = trigger.getAttribute("aria-expanded") === "true";
    const content = trigger.parentElement.nextElementSibling;
    const icon = trigger.querySelector(".icon-indicator");
    trigger.setAttribute("aria-expanded", !isExpanded);
    if (content) {
      content.style.display = !isExpanded ? "block" : "none";
      content.setAttribute("aria-hidden", isExpanded);
    }
    if (icon) icon.textContent = !isExpanded ? "-" : "+";
  });

  const chartSwapSelect = document.getElementById("lawyer-chartswap-status");
  if (chartSwapSelect) {
    chartSwapSelect.addEventListener("change", updateCallerType);
  }
})();
