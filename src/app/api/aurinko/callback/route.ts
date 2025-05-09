import { getAccountDetails, getAurinkoToken } from "@/lib/aurinko";
import { waitUntil } from '@vercel/functions'
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server";
import axios from "axios";
import { type NextRequest, NextResponse } from "next/server";

export const GET = async (req: NextRequest) => {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

        const params = req.nextUrl.searchParams
        const status = params.get('status');
        if (status !== 'success') return NextResponse.json({ error: "Account connection failed" }, { status: 400 });

        const code = params.get('code');
        if (!code) return NextResponse.json({ error: "No authorization code provided" }, { status: 400 });

        const token = await getAurinkoToken(code);
        if (!token) return NextResponse.json({ error: "Failed to fetch token" }, { status: 400 });

        const accountDetails = await getAccountDetails(token.accessToken);
        
        await db.account.upsert({
            where: { id: token.accountId.toString() },
            create: {
                id: token.accountId.toString(),
                userId,
                token: token.accessToken,
                provider: 'Aurinko',
                emailAddress: accountDetails.email,
                name: accountDetails.name
            },
            update: {
                token: token.accessToken,
            }
        });

        // Start initial sync
        waitUntil(
            axios.post(`${process.env.NEXT_PUBLIC_URL}/api/initial-sync`, { 
                accountId: token.accountId.toString(), 
                userId 
            }).catch((err) => {
                console.error('Initial sync failed:', err.response?.data || err.message);
            })
        );

        return NextResponse.redirect(new URL('/mail', req.url));
    } catch (error) {
        console.error('Callback error:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'An unexpected error occurred' 
        }, { status: 500 });
    }
}