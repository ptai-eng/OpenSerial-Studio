export interface ControlSpec {
  id: string;
  type: 'button' | 'slider';
}

export function generateArduinoCode(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;

  let code = `/*
 * OpenSerial Studio Auto-Generated Code
 * Board: Arduino (Uno, Mega, ESP32, ESP8266)
 * Dependency: ArduinoJson library (install via Library Manager)
 */

#include <ArduinoJson.h>

unsigned long lastSendTime = 0;
const int sendInterval = 100; // Send data every 100ms (10Hz)

void setup() {
  Serial.begin(115200);
  while (!Serial) continue;
`;

  if (hasRx) {
    code += `\n  // Initialize pins for controls\n`;
    controls.forEach(c => {
      if (c.type === 'button') {
        code += `  // pinMode(${c.id}_PIN, OUTPUT);\n`;
      }
    });
  }

  code += `}\n\nvoid loop() {\n`;

  if (hasRx) {
    code += `  // --- RX: Read commands from Web Dashboard ---\n`;
    code += `  if (Serial.available()) {\n`;
    code += `    String input = Serial.readStringUntil('\\n');\n`;
    code += `    JsonDocument doc;\n`;
    code += `    DeserializationError error = deserializeJson(doc, input);\n\n`;
    code += `    if (!error) {\n`;
    controls.forEach(c => {
      code += `      if (doc.containsKey("${c.id}")) {\n`;
      if (c.type === 'button') {
        code += `        int val = doc["${c.id}"];\n`;
        code += `        // digitalWrite(${c.id}_PIN, val);\n`;
      } else {
        code += `        int val = doc["${c.id}"];\n`;
        code += `        // analogWrite(${c.id}_PIN, val);\n`;
      }
      code += `      }\n`;
    });
    code += `    }\n  }\n\n`;
  }

  if (hasTx || !hasRx) { // If nothing, generate generic tx
    const txWidgets = hasTx ? widgets : ['Temperature', 'Humidity'];
    code += `  // --- TX: Send data to Web Dashboard ---\n`;
    code += `  if (millis() - lastSendTime >= sendInterval) {\n`;
    code += `    lastSendTime = millis();\n\n`;
    code += `    JsonDocument doc;\n`;
    txWidgets.forEach(w => {
      code += `    doc["${w}"] = random(0, 100); // Replace with actual sensor read\n`;
    });
    code += `\n    serializeJson(doc, Serial);\n`;
    code += `    Serial.println();\n  }\n`;
  }

  code += `}\n`;
  return code;
}

export function generateSTM32Code(widgets: string[], controls: ControlSpec[]): string {
  const hasRx = controls.length > 0;
  const hasTx = widgets.length > 0;

  let code = `/*
 * OpenSerial Studio Auto-Generated Code
 * Board: STM32 (HAL)
 * Note: Redirect printf to UART using _write(), or use snprintf & HAL_UART_Transmit.
 * For parsing JSON in C, we highly recommend using the lightweight cJSON library.
 */

#include <stdio.h>
#include <string.h>
${hasRx ? '#include "cJSON.h"' : '// #include "cJSON.h" // Uncomment if using cJSON'}

// Example: Redirect printf to UART1
/*
int _write(int file, char *ptr, int len) {
    HAL_UART_Transmit(&huart1, (uint8_t *)ptr, len, HAL_MAX_DELAY);
    return len;
}
*/

void OpenSerial_Task(void) {
`;

  if (hasTx || !hasRx) {
    const txWidgets = hasTx ? widgets : ['Temperature', 'Status'];
    code += `    // --- TX: Send data to Web Dashboard ---\n`;
    
    // Construct format string and arguments
    let formatStr = '{';
    let argsStr = '';
    
    txWidgets.forEach((w, index) => {
      formatStr += `\\"${w}\\": %d`; // Assuming int for simplicity, user can change to %f
      argsStr += `25`; // Dummy value
      if (index < txWidgets.length - 1) {
        formatStr += ', ';
        argsStr += ', ';
      }
    });
    formatStr += '}\\n';

    code += `    // Make sure your JSON string is well-formed\n`;
    code += `    printf("${formatStr}", ${argsStr});\n`;
    code += `    HAL_Delay(100);\n\n`;
  }

  if (hasRx) {
    code += `    // --- RX: Read commands from Web Dashboard ---\n`;
    code += `    // Assuming 'rxBuffer' contains the received JSON string and 'rxDataReady' is a flag\n`;
    code += `    /*\n`;
    code += `    if (rxDataReady) {\n`;
    code += `        cJSON *json = cJSON_Parse(rxBuffer);\n`;
    code += `        if (json) {\n`;
    
    controls.forEach(c => {
      code += `            cJSON *item_${c.id} = cJSON_GetObjectItem(json, "${c.id}");\n`;
      code += `            if (cJSON_IsNumber(item_${c.id})) {\n`;
      if (c.type === 'button') {
        code += `                // HAL_GPIO_WritePin(${c.id}_PORT, ${c.id}_PIN, item_${c.id}->valueint);\n`;
      } else {
        code += `                // __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, item_${c.id}->valueint);\n`;
      }
      code += `            }\n`;
    });
    
    code += `            cJSON_Delete(json);\n`;
    code += `        }\n`;
    code += `        rxDataReady = 0;\n`;
    code += `    }\n`;
    code += `    */\n`;
  }

  code += `}\n`;
  return code;
}
