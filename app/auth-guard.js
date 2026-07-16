/**
 * Auth Guard - ป้องกันการเข้าถึงหน้าโดยไม่ได้ล็อกอิน
 * วิธีใช้: เพิ่ม <script src="../app/auth-guard.js"></script> ในหน้า HTML ที่ต้องการป้องกัน
 * (หลังจาก Firebase SDK และ firebase-config.js)
 */

(function () {
    'use strict';

    // ซ่อนหน้าเว็บไว้ก่อนจนกว่าจะเช็ค auth เสร็จ
    document.documentElement.style.visibility = 'hidden';
    document.documentElement.style.opacity = '0';

    // รอ Firebase SDK โหลดเสร็จ
    function waitForFirebase(callback, maxAttempts = 50) {
        let attempts = 0;
        const checkFirebase = setInterval(function () {
            attempts++;
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                clearInterval(checkFirebase);
                callback();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkFirebase);
                console.error('Auth Guard: Firebase ไม่พร้อมใช้งาน');
                redirectToLogin();
            }
        }, 100);
    }

    // Redirect ไปหน้า login
    function redirectToLogin() {
        // หา path ที่ถูกต้องไปยัง login.html
        const currentPath = window.location.pathname;
        let loginPath = '/login.html';

        // ถ้าอยู่ใน /src/ ให้ใช้ ../login.html
        if (currentPath.includes('/src/')) {
            loginPath = '../login.html';
        }

        window.location.href = loginPath;
    }

    // แสดงหน้าเว็บ (เมื่อเช็ค auth ผ่าน)
    function showPage() {
        document.documentElement.style.visibility = 'visible';
        document.documentElement.style.opacity = '1';
        document.documentElement.style.transition = 'opacity 0.3s ease';
    }

    // เช็คสถานะ auth
    function checkAuthState() {
        const auth = firebase.auth();
        const db = firebase.firestore();

        // ใช้ onAuthStateChanged เพื่อเช็คสถานะ
        const unsubscribe = auth.onAuthStateChanged(async function (user) {
            unsubscribe(); // ยกเลิก listener หลังจากได้ค่าแล้ว

            if (!user) {
                // ไม่ได้ล็อกอิน -> redirect ไป login
                console.log('Auth Guard: ไม่ได้ล็อกอิน - Redirecting to login...');
                redirectToLogin();
                return;
            }

            try {
                // เช็คสถานะผู้ใช้ใน Firestore
                const userDoc = await db.collection('users').doc(user.uid).get();

                if (userDoc.exists) {
                    const userData = userDoc.data();

                    // เช็ค status (ถูก suspend หรือไม่)
                    if (userData.status === 'suspended') {
                        console.log('Auth Guard: บัญชีถูกระงับ');
                        await auth.signOut();
                        redirectToLogin();
                        return;
                    }

                    // เช็ค expiryDate (หมดอายุหรือไม่)
                    if (userData.expiryDate) {
                        const expiryDate = typeof userData.expiryDate.toDate === 'function'
                            ? userData.expiryDate.toDate()
                            : new Date(userData.expiryDate);

                        if (expiryDate < new Date()) {
                            console.log('Auth Guard: บัญชีหมดอายุ');
                            await auth.signOut();
                            redirectToLogin();
                            return;
                        }
                    }
                }

                // ผ่านทุกการเช็ค -> แสดงหน้าเว็บ
                console.log('Auth Guard: ผ่านการตรวจสอบ ✓');
                showPage();

            } catch (error) {
                console.error('Auth Guard: Error checking user status', error);
                // ถ้าเกิด error ให้แสดงหน้าเว็บไปก่อน (กรณี Firestore มีปัญหา)
                showPage();
            }
        });

        // Timeout fallback - ถ้าเช็คนานเกิน 5 วินาที ให้ redirect ไป login
        setTimeout(function () {
            if (document.documentElement.style.visibility === 'hidden') {
                console.warn('Auth Guard: Timeout - Redirecting to login...');
                redirectToLogin();
            }
        }, 5000);
    }

    // เริ่มต้นเช็ค
    waitForFirebase(checkAuthState);

})();
