Set WshShell = CreateObject("WScript.Shell")
' Run FastApi in the background (0 = Hidden, False = Do not wait)
WshShell.Run "cmd /c cd backend && .\.venv\Scripts\python.exe -m uvicorn main:app --port 8000", 0, False

' Run NextJs in the background (0 = Hidden, False = Do not wait)
WshShell.Run "cmd /c cd frontend && npm run dev", 0, False

MsgBox "The AI Expense Tracker has started in the background!" & vbCrLf & vbCrLf & "Frontend: http://localhost:3000" & vbCrLf & "Backend: http://localhost:8000" & vbCrLf & vbCrLf & "To stop it later, use Task Manager to end the 'node.exe' and 'python.exe' processes.", vbInformation, "Server Started"
