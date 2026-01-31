const vm = require("vm");

/**
 * Basic JS code verification.
 * In a real production app, this would be a secure sandbox (e.g., Docker).
 */
async function verifyCode(code, language = "javascript") {
    if (language !== "javascript") {
        return { success: true, message: "Verification only supported for JavaScript currently." };
    }

    try {
        const script = new vm.Script(code);
        const context = vm.createContext({ console });

        // Timeout to prevent infinite loops
        script.runInContext(context, { timeout: 1000 });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    verifyCode
};
