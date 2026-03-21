# **User Permissions & Data Visibility Matrix**

This matrix outlines the capabilities of each user role concerning Objectives, Key Results, and system Settings.

### **User Roles Defined:**

* **CEO / Super Admin:** The highest level of access. Has a global view of the entire organization. This persona is assigned the **Admin** role.  
* **Administrator (Admin):** Typically an OKR champion or HR partner. Has the same permissions as the CEO. Responsible for system setup and user management.  
* **Department Head / Manager (Manager/Lead):** Leads a team or department. Responsible for setting team-level OKRs and overseeing the OKRs of their direct reports.  
* **Individual Contributor (Member):** A regular employee responsible for their own individual objectives.

---

### **The Matrix**

| Feature / Action | CEO / Super Admin | Administrator (Admin) | Dept. Head / Manager (Manager/Lead) | Individual Contributor (Member) |
| :---- | :---- | :---- | :---- | :---- |
| **I. System-Wide Actions** |  |  |  |  |
| Access & Manage **Settings** | **Full Control** | **Full Control** | **No Access** | **No Access** |
| Manage Users & Teams | **Full Control** | **Full Control** | **No Access** | **No Access** |
| Manage OKR Timeframes | **Full Control** | **Full Control** | **No Access** | **No Access** |
| View Company-Wide **Hierarchy Map** | **Full Control** | **Full Control** | **Full View** | **Full View** |
|  |  |  |  |  |
| **II. Company-Level OKRs** |  |  |  |  |
| **Create** Company Objectives | ✅ Yes | ✅ Yes | **No** | **No** |
| **Edit / Delete** Company Objectives | ✅ Yes | ✅ Yes | **No** | **No** |
| **View** Company Objective Details | **Full View** | **Full View** | **Full View** | **Full View** |
| **View** Company Key Result Details | **Full View** | **Full View** | **Full View** | **Full View** |
|  |  |  |  |  |
| **III. Their Own Department's OKRs** |  |  |  |  |
| **Create** Their Dept. Objectives | N/A | N/A | ✅ Yes | N/A |
| **Edit / Delete** Their Dept. Objectives | ✅ Yes | ✅ Yes | ✅ Yes | **No** |
| **View** Their Dept. Objective Details | **Full View** | **Full View** | **Full View** | See Rule |
| **View** Their Dept. Key Result Details | **Full View** | **Full View** | **Full View** | See Rule |
|  |  |  |  |  |
| **IV. Other Departments' OKRs** |  |  |  |  |
| **Create** Other Dept. Objectives | ✅ Yes | ✅ Yes | **No** | **No** |
| **Edit / Delete** Other Dept. Objectives | ✅ Yes | ✅ Yes | **No** | **No** |
| **View** Other Dept. Objective Details | **Full View** | **Full View** | See Rule | See Rule |
| **View** Other Dept. Key Result Details | **Full View** | **Full View** | See Rule | See Rule |
|  |  |  |  |  |
| **V. Their Direct Reports' OKRs** |  |  |  |  |
| **Create** Objectives for a Report | N/A | N/A | ✅ Yes | N/A |
| **Edit / Delete** a Report's Objectives | ✅ Yes | ✅ Yes | **No** | N/A |
| **View** a Report's Objective Details | **Full View** | **Full View** | **Full View** | N/A |
| **View** a Report's Key Result Details | **Full View** | **Full View** | **Full View** | N/A |
|  |  |  |  |  |
| **VI. Their Own Individual OKRs** |  |  |  |  |
| **Create** Their Own Objectives | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Edit / Delete** Their Own Objectives | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **View** Their Own Objective Details | **Full View** | **Full View** | **Full View** | **Full View** |
| **View** Their Own Key Result Details | **Full View** | **Full View** | **Full View** | **Full View** |
|  |  |  |  |  |
| **VII. Other Individuals' OKRs** |  |  |  |  |
| **Create** OKRs for Other Individuals | ✅ Yes | ✅ Yes | **No** | **No** |
| **Edit / Delete** OKRs for Other Individuals | ✅ Yes | ✅ Yes | **No** | **No** |
| **View** Other Individuals' Objective Details | **Full View** | **Full View** | See Rule | See Rule |
| **View** Other Individuals' Key Result Details | **Full View** | **Full View** | See Rule | See Rule |

---

### **Data Visibility Rules**

This section clarifies the conditional logic referenced in the matrix, especially for the Individual Contributor (Member) and Dept. Head / Manager roles when viewing OKRs they do not own or manage.

#### **Rule: The "Visibility" Setting**

For any Objective or Key Result that a user does not have explicit "Full View" access to, their visibility is determined by a **"Visibility" property** on that specific OKR item.

* **Property:** Each Objective and each Key Result will have a boolean property in the database: isPrivate.  
  * isPrivate \= false (Default): The item is **Public**.  
  * isPrivate \= true: The item is **Private**.  
*   
* **Behavior for Public Items (**  
  * Any user (Manager or Member) can see the **full details** of the Objective or Key Result. This includes its title, description, owner, and current progress value (e.g., "864 Signups").  
*   
* **Behavior for Private Items (**  
  * Any user (Manager or Member) will see a placeholder or redacted version of the item.  
  * The **Title** will be replaced with generic text like \[Private Objective\].  
  * The **Description** will be hidden.  
  * The specific progress value will be hidden.  
  * Crucially, the **calculated % progress** will remain visible. This allows for transparency in alignment and overall progress without revealing sensitive details. For example, they would see "35%" but not "864 Signups".  
* 

#### **Example Scenario for an Individual Contributor (Employee):**

1. The employee opens the **Company Hierarchy Map**.  
2. They see the **Company Objective** "Increase Q1 Revenue" (Public) \-\> **Full details visible**.  
3. This is aligned to their **Department's Objective**, "Achieve $1M in New Bookings". The Dept. Head set this objective's visibility to **Public** \-\> **Full details visible**.  
4. This department objective is supported by three Key Results:  
   * KR 1: "Close 50 Enterprise Deals" (Visibility: **Public**) \-\> **Full details visible.**  
   * KR 2: "Sign new partnership with Project X" (Visibility: **Private**, as it's a secret deal) \-\> The employee sees a card titled **\[Private Key Result\]** with only its **progress percentage (e.g., "50%")** visible.  
   * KR 3: "Increase renewal rate to 95%" (Visibility: **Public**) \-\> **Full details visible.**  
5.   
6. The employee can click on their **own** objectives and see **full details** for everything, regardless of any visibility settings.

